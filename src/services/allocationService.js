/**
 * Allocation & Transfer Service
 *
 * Two-phase conflict check for allocations.
 * Transfer requests in subcollection: allocations/{id}/transferRequests/{id}
 */

import {
  collection, collectionGroup, doc, addDoc, getDoc, getDocs,
  updateDoc, query, where, orderBy, limit,
  runTransaction, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { createNotificationInBatch } from "./notificationService";
import { addActivityLogInBatch } from "./activityLogService";
import { addAssetHistoryInBatch } from "./assetService";

/**
 * Allocate an asset to a user or department.
 */
export async function allocateAsset({
  assetId, assetTag, holderId, holderType, holderName,
  allocatedByUserId, expectedReturnDate = null,
}, actorUser) {
  // Phase 1: pre-check
  const existingQ = query(collection(db, "allocations"),
    where("assetId", "==", assetId), where("status", "==", "Active"));
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) {
    const existing = existingSnap.docs[0].data();
    throw new Error(`Asset is currently held by ${existing.holderName}. Use "Request Transfer" instead.`);
  }

  // Phase 2: transaction
  const allocationRef = doc(collection(db, "allocations"));
  await runTransaction(db, async (txn) => {
    const assetSnap = await txn.get(doc(db, "assets", assetId));
    if (!assetSnap.exists()) throw new Error("Asset not found.");
    if (assetSnap.data().status !== "Available")
      throw new Error(`Asset status is "${assetSnap.data().status}" — must be "Available".`);

    txn.set(allocationRef, {
      assetId, assetTag: assetTag || assetSnap.data().assetTag || "",
      holderId, holderType, holderName, allocatedByUserId,
      allocatedAt: serverTimestamp(), expectedReturnDate: expectedReturnDate || null,
      actualReturnDate: null, returnConditionNotes: null, status: "Active",
    });

    txn.update(doc(db, "assets", assetId), {
      status: "Allocated", currentHolderId: holderId,
      currentHolderName: holderName, currentHolderType: holderType,
      updatedAt: serverTimestamp(),
    });

    addAssetHistoryInBatch(txn, assetId, {
      type: "Allocation", refId: allocationRef.id,
      description: `Allocated to ${holderName} (${holderType})`,
      actorUserId: actorUser.uid,
    });

    if (holderType === "Employee") {
      createNotificationInBatch(txn, {
        userId: holderId, type: "AssetAssigned", title: "Asset Assigned",
        message: `You have been assigned asset ${assetTag}`,
        relatedRefId: allocationRef.id,
      });
    }

    addActivityLogInBatch(txn, {
      actorUserId: actorUser.uid, actorName: actorUser.name || "",
      action: "ASSET_ALLOCATED", targetCollection: "allocations",
      targetDocId: allocationRef.id,
      metadata: { assetId, assetTag, holderId, holderType, holderName },
    });
  });
  return { id: allocationRef.id };
}

/**
 * Return an allocated asset.
 */
export async function returnAsset(allocationId, { returnConditionNotes = null } = {}, actorUser) {
  await runTransaction(db, async (txn) => {
    const allocSnap = await txn.get(doc(db, "allocations", allocationId));
    if (!allocSnap.exists()) throw new Error("Allocation not found.");
    const allocData = allocSnap.data();
    if (allocData.status !== "Active") throw new Error(`Cannot return — status is "${allocData.status}".`);

    txn.update(doc(db, "allocations", allocationId), {
      status: "Returned", actualReturnDate: serverTimestamp(), returnConditionNotes,
    });
    txn.update(doc(db, "assets", allocData.assetId), {
      status: "Available", currentHolderId: null, currentHolderName: null,
      currentHolderType: null, updatedAt: serverTimestamp(),
    });

    addAssetHistoryInBatch(txn, allocData.assetId, {
      type: "Return", refId: allocationId,
      description: `Returned by ${allocData.holderName}`, actorUserId: actorUser.uid,
    });
    addActivityLogInBatch(txn, {
      actorUserId: actorUser.uid, actorName: actorUser.name || "",
      action: "ASSET_RETURNED", targetCollection: "allocations",
      targetDocId: allocationId,
      metadata: { assetId: allocData.assetId, assetTag: allocData.assetTag },
    });
  });
}

/** Request a transfer. */
export async function requestTransfer(allocationId, { requestedByUserId, requestedForUserId, reason }) {
  const ref = await addDoc(collection(db, "allocations", allocationId, "transferRequests"), {
    requestedByUserId, requestedForUserId, reason,
    status: "Requested", approvedByUserId: null,
    requestedAt: serverTimestamp(), resolvedAt: null,
  });
  await updateDoc(doc(db, "allocations", allocationId), { status: "TransferRequested" });
  return { id: ref.id };
}

/** Approve a transfer — close old allocation, create new one, update asset. */
export async function approveTransfer(allocationId, requestId, approvedByUserId, newHolder, actorUser) {
  const newAllocRef = doc(collection(db, "allocations"));
  await runTransaction(db, async (txn) => {
    const allocSnap = await txn.get(doc(db, "allocations", allocationId));
    if (!allocSnap.exists()) throw new Error("Allocation not found.");
    const d = allocSnap.data();

    txn.update(doc(db, "allocations", allocationId), { status: "TransferApproved", actualReturnDate: serverTimestamp() });
    txn.update(doc(db, "allocations", allocationId, "transferRequests", requestId), {
      status: "Approved", approvedByUserId, resolvedAt: serverTimestamp(),
    });
    txn.set(newAllocRef, {
      assetId: d.assetId, assetTag: d.assetTag,
      holderId: newHolder.holderId, holderType: newHolder.holderType,
      holderName: newHolder.holderName, allocatedByUserId: approvedByUserId,
      allocatedAt: serverTimestamp(), expectedReturnDate: null,
      actualReturnDate: null, returnConditionNotes: null, status: "Active",
    });
    txn.update(doc(db, "assets", d.assetId), {
      currentHolderId: newHolder.holderId, currentHolderName: newHolder.holderName,
      currentHolderType: newHolder.holderType, updatedAt: serverTimestamp(),
    });

    addAssetHistoryInBatch(txn, d.assetId, {
      type: "Transfer", refId: newAllocRef.id,
      description: `Transferred from ${d.holderName} to ${newHolder.holderName}`,
      actorUserId: actorUser.uid,
    });
    if (newHolder.holderType === "Employee") {
      createNotificationInBatch(txn, {
        userId: newHolder.holderId, type: "TransferApproved", title: "Transfer Approved",
        message: `Asset ${d.assetTag} transferred to you`, relatedRefId: newAllocRef.id,
      });
    }
    addActivityLogInBatch(txn, {
      actorUserId: actorUser.uid, actorName: actorUser.name || "",
      action: "TRANSFER_APPROVED", targetCollection: "allocations",
      targetDocId: newAllocRef.id,
      metadata: { assetId: d.assetId, from: d.holderName, to: newHolder.holderName },
    });
  });
  return { id: newAllocRef.id };
}

/** Reject a transfer request. */
export async function rejectTransfer(allocationId, requestId, approvedByUserId) {
  await updateDoc(doc(db, "allocations", allocationId, "transferRequests", requestId), {
    status: "Rejected", approvedByUserId, resolvedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "allocations", allocationId), { status: "Active" });
}

/** List allocations with filters. */
export async function listAllocations({ assetId = null, holderId = null, status = null, maxResults = 50 } = {}) {
  const c = [];
  if (assetId) c.push(where("assetId", "==", assetId));
  if (holderId) c.push(where("holderId", "==", holderId));
  if (status) c.push(where("status", "==", status));
  c.push(orderBy("allocatedAt", "desc"), limit(maxResults));
  const snap = await getDocs(query(collection(db, "allocations"), ...c));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getActiveAllocations() { return listAllocations({ status: "Active" }); }

/** Collection-group query — pending transfers across all allocations. */
export async function getPendingTransfers() {
  const q = query(collectionGroup(db, "transferRequests"),
    where("status", "==", "Requested"), orderBy("requestedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getTransferRequests(allocationId) {
  const q = query(collection(db, "allocations", allocationId, "transferRequests"), orderBy("requestedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Overdue allocations — computed at read time. */
export async function getOverdueAllocations() {
  const q = query(collection(db, "allocations"),
    where("status", "==", "Active"),
    where("expectedReturnDate", "<", new Date()),
    orderBy("expectedReturnDate", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
