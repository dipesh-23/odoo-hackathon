/**
 * Audit Service
 *
 * Implements the batch close logic for Audit Cycles.
 * - writeBatch across all assetChecks where result == "Missing" -> assets.status = "Lost"
 * - Submits cycle close and discrepancy report in the same atomic batch.
 */

import {
  collection, doc, addDoc, getDoc, getDocs, setDoc,
  query, where, orderBy, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { addActivityLogInBatch } from "./activityLogService";
import { addAssetHistoryInBatch } from "./assetService";

/**
 * Create a new audit cycle.
 */
export async function createAuditCycle({
  scopeType, scopeValue, startDate, endDate, auditorUserIds,
}, actorUser) {
  const ref = await addDoc(collection(db, "auditCycles"), {
    scopeType, scopeValue, startDate, endDate, auditorUserIds,
    status: "Planned", createdAt: serverTimestamp(), closedAt: null,
  });

  // Activity log (standalone since we're not in a batch here)
  await addDoc(collection(db, "activityLogs"), {
    actorUserId: actorUser.uid, actorName: actorUser.name || "",
    action: "AUDIT_CREATED", targetCollection: "auditCycles",
    targetDocId: ref.id,
    metadata: { scopeType, scopeValue },
    timestamp: serverTimestamp(),
  });

  return { id: ref.id };
}

/**
 * Upsert an asset check into an audit cycle.
 * Doc ID = assetId for easy upserts.
 */
export async function addAssetCheck(auditCycleId, assetId, {
  assetTag, verifiedByUserId, result, notes = null,
}) {
  const ref = doc(db, "auditCycles", auditCycleId, "assetChecks", assetId);
  await setDoc(ref, {
    assetTag, verifiedByUserId, result, notes,
    checkedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Close an audit cycle.
 * Batch writes missing assets to "Lost", creates discrepancy report, closes cycle.
 */
export async function closeAuditCycle(auditCycleId, actorUser) {
  const checksSnap = await getDocs(collection(db, "auditCycles", auditCycleId, "assetChecks"));
  
  let totalAssetsChecked = 0;
  let missingCount = 0;
  let damagedCount = 0;
  const flaggedAssetIds = [];

  const flaggedChecks = [];
  checksSnap.docs.forEach((d) => {
    totalAssetsChecked++;
    const check = d.data();
    if (check.result === "Missing" || check.result === "Damaged") {
      flaggedChecks.push({ id: d.id, ...check });
    }
  });

  // Pre-fetch flagged assets defensively to skip deleted ones
  const verifiedFlagged = await Promise.all(
    flaggedChecks.map(async (check) => {
      const snap = await getDoc(doc(db, "assets", check.id));
      return { check, exists: snap.exists() };
    })
  );

  let batch = writeBatch(db);
  let opCount = 0;
  
  const commitBatch = async () => {
    if (opCount > 0) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  for (const { check, exists } of verifiedFlagged) {
    if (!exists) continue; // Skip deleted assets safely
    
    if (opCount >= 450) await commitBatch();

    if (check.result === "Missing") {
      missingCount++;
      flaggedAssetIds.push(check.id);
      batch.update(doc(db, "assets", check.id), {
        status: "Lost", updatedAt: serverTimestamp(),
      });
      addAssetHistoryInBatch(batch, check.id, {
        type: "AuditFlag", refId: auditCycleId,
        description: "Marked as Lost during audit",
        actorUserId: actorUser.uid,
      });
      opCount += 2;
    } else if (check.result === "Damaged") {
      damagedCount++;
      flaggedAssetIds.push(check.id);
      addAssetHistoryInBatch(batch, check.id, {
        type: "AuditFlag", refId: auditCycleId,
        description: `Marked as Damaged during audit. Notes: ${check.notes || ""}`,
        actorUserId: actorUser.uid,
      });
      opCount += 1;
    }
  }

  // Final cycle metadata writes
  if (opCount >= 450) await commitBatch();

  const reportRef = doc(db, "auditCycles", auditCycleId, "discrepancyReport", "summary");
  batch.set(reportRef, {
    totalAssetsChecked, missingCount, damagedCount, flaggedAssetIds,
    generatedAt: serverTimestamp(),
  });
  opCount += 1;

  batch.update(doc(db, "auditCycles", auditCycleId), {
    status: "Closed", closedAt: serverTimestamp(),
  });
  opCount += 1;

  addActivityLogInBatch(batch, {
    actorUserId: actorUser.uid, actorName: actorUser.name || "",
    action: "AUDIT_CLOSED", targetCollection: "auditCycles",
    targetDocId: auditCycleId,
    metadata: { totalAssetsChecked, missingCount, damagedCount },
  });
  opCount += 1;

  await commitBatch();

  return { totalAssetsChecked, missingCount, damagedCount };
}

/** Get a single audit cycle. */
export async function getAuditCycle(auditCycleId) {
  const snap = await getDoc(doc(db, "auditCycles", auditCycleId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** List audit cycles. */
export async function listAuditCycles({ status = null } = {}) {
  const c = [];
  if (status) c.push(where("status", "==", status));
  c.push(orderBy("createdAt", "desc"));
  const snap = await getDocs(query(collection(db, "auditCycles"), ...c));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Get asset checks for a cycle. */
export async function getAssetChecks(auditCycleId) {
  const snap = await getDocs(collection(db, "auditCycles", auditCycleId, "assetChecks"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Get discrepancy report for a closed cycle. */
export async function getDiscrepancyReport(auditCycleId) {
  const snap = await getDoc(doc(db, "auditCycles", auditCycleId, "discrepancyReport", "summary"));
  if (!snap.exists()) return null;
  return snap.data();
}
