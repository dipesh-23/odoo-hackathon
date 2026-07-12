/**
 * Maintenance Service
 *
 * Two-way status sync with assets via runTransaction:
 * - "Approved" → assets.status = "UnderMaintenance"
 * - "Resolved" → assets.status = "Available" (unless retired)
 */

import {
  collection, doc, addDoc, getDoc, getDocs,
  query, where, orderBy, limit,
  runTransaction, increment, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { createNotificationInBatch } from "./notificationService";
import { addActivityLogInBatch } from "./activityLogService";
import { addAssetHistoryInBatch } from "./assetService";

/**
 * Raise a new maintenance request.
 */
export async function createMaintenanceRequest({
  assetId, assetTag, raisedByUserId, issueDescription,
  priority = "Medium", photoUrl = null,
}, actorUser) {
  const ref = await addDoc(collection(db, "maintenanceRequests"), {
    assetId, assetTag, raisedByUserId, issueDescription,
    priority, photoUrl, status: "Pending",
    approvedByUserId: null, technicianName: null,
    raisedAt: serverTimestamp(), resolvedAt: null, resolutionNotes: null,
  });

  // Standalone activity log
  await addDoc(collection(db, "activityLogs"), {
    actorUserId: actorUser.uid, actorName: actorUser.name || "",
    action: "MAINTENANCE_RAISED", targetCollection: "maintenanceRequests",
    targetDocId: ref.id,
    metadata: { assetId, assetTag, priority, issueDescription },
    timestamp: serverTimestamp(),
  });

  return { id: ref.id };
}

/**
 * Update maintenance request status with two-way asset sync.
 *
 * @param {string} requestId
 * @param {string} newStatus - "Pending"|"Approved"|"Rejected"|"TechnicianAssigned"|"InProgress"|"Resolved"
 * @param {Object} extra - { technicianName, resolutionNotes, approvedByUserId }
 * @param {Object} actorUser - { uid, name }
 */
export async function updateMaintenanceStatus(requestId, newStatus, {
  technicianName = null, resolutionNotes = null, approvedByUserId = null,
} = {}, actorUser) {
  const validStatuses = ["Pending", "Approved", "Rejected", "TechnicianAssigned", "InProgress", "Resolved"];
  if (!validStatuses.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);

  await runTransaction(db, async (txn) => {
    const reqSnap = await txn.get(doc(db, "maintenanceRequests", requestId));
    if (!reqSnap.exists()) throw new Error("Maintenance request not found.");
    const reqData = reqSnap.data();
    const assetId = reqData.assetId;

    // Firestore requires all reads before writes
    let assetStatus = null;
    if (newStatus === "Resolved") {
      const assetSnap = await txn.get(doc(db, "assets", assetId));
      assetStatus = assetSnap.exists() ? assetSnap.data().status : null;
    }

    // Update request doc
    const updateData = { status: newStatus };
    if (technicianName) updateData.technicianName = technicianName;
    if (resolutionNotes) updateData.resolutionNotes = resolutionNotes;
    if (approvedByUserId) updateData.approvedByUserId = approvedByUserId;
    if (newStatus === "Resolved") updateData.resolvedAt = serverTimestamp();

    txn.update(doc(db, "maintenanceRequests", requestId), updateData);

    // Two-way asset status sync
    if (newStatus === "Approved") {
      txn.update(doc(db, "assets", assetId), {
        status: "UnderMaintenance", updatedAt: serverTimestamp(),
      });
      addAssetHistoryInBatch(txn, assetId, {
        type: "MaintenanceStart", refId: requestId,
        description: `Maintenance approved: ${reqData.issueDescription}`,
        actorUserId: actorUser.uid,
      });
    } else if (newStatus === "Resolved") {
      // Check if asset is retired before setting Available
      if (assetStatus !== "Retired" && assetStatus !== "Disposed") {
        txn.update(doc(db, "assets", assetId), {
          status: "Available", updatedAt: serverTimestamp(),
        });
      }
      addAssetHistoryInBatch(txn, assetId, {
        type: "MaintenanceEnd", refId: requestId,
        description: `Maintenance resolved: ${resolutionNotes || ""}`,
        actorUserId: actorUser.uid,
      });

      // Increment maintenance count in asset stats
      const statsRef = doc(db, "assets", assetId, "stats", "summary");
      txn.set(statsRef, {
        maintenanceCount: increment(1), updatedAt: serverTimestamp(),
      }, { merge: true });
    }

    // Notification to the user who raised the request
    const notifType = newStatus === "Approved" ? "MaintenanceApproved"
      : newStatus === "Rejected" ? "MaintenanceRejected" : null;
    if (notifType) {
      createNotificationInBatch(txn, {
        userId: reqData.raisedByUserId, type: notifType,
        title: `Maintenance ${newStatus}`,
        message: `Your maintenance request for ${reqData.assetTag} has been ${newStatus.toLowerCase()}`,
        relatedRefId: requestId,
      });
    }

    // Activity log
    addActivityLogInBatch(txn, {
      actorUserId: actorUser.uid, actorName: actorUser.name || "",
      action: `MAINTENANCE_${newStatus.toUpperCase()}`,
      targetCollection: "maintenanceRequests", targetDocId: requestId,
      metadata: { assetId, assetTag: reqData.assetTag, newStatus },
    });
  });
}

/**
 * List maintenance requests with filters.
 */
export async function listMaintenanceRequests({
  assetId = null, status = null, priority = null, maxResults = 50,
} = {}) {
  const c = [];
  if (assetId) c.push(where("assetId", "==", assetId));
  if (status) c.push(where("status", "==", status));
  if (priority) c.push(where("priority", "==", priority));
  c.push(orderBy("raisedAt", "desc"), limit(maxResults));

  const snap = await getDocs(query(collection(db, "maintenanceRequests"), ...c));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get a single maintenance request.
 */
export async function getMaintenanceRequest(requestId) {
  const snap = await getDoc(doc(db, "maintenanceRequests", requestId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** Pending requests count for dashboard KPI. */
export async function getPendingMaintenanceCount() {
  const q = query(collection(db, "maintenanceRequests"), where("status", "==", "Pending"));
  const snap = await getDocs(q);
  return snap.size;
}
