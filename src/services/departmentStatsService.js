/**
 * Department Stats Service
 *
 * Manages the `departmentStats/{departmentId}` collection for the
 * "Utilization by department" bar chart on the Reports screen.
 * The client recomputes and writes this after any allocation/return.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Update (or create) the department stats rollup doc.
 * Called by the allocation/return service after each action.
 *
 * @param {string} departmentId
 * @param {string} departmentName - denormalized
 * @param {Object} stats
 * @param {number} stats.assetsAllocated
 * @param {number} stats.utilizationScore - e.g. allocated / total assets in dept
 */
export async function updateDepartmentStats(departmentId, departmentName, {
  assetsAllocated,
  utilizationScore,
}) {
  return setDoc(doc(db, "departmentStats", departmentId), {
    departmentName,
    assetsAllocated,
    utilizationScore,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Update department stats within an existing batch/transaction.
 */
export function updateDepartmentStatsInBatch(batchOrTxn, departmentId, departmentName, {
  assetsAllocated,
  utilizationScore,
}) {
  const ref = doc(db, "departmentStats", departmentId);
  batchOrTxn.set(ref, {
    departmentName,
    assetsAllocated,
    utilizationScore,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Get stats for a single department.
 */
export async function getDepartmentStatsById(departmentId) {
  const snap = await getDoc(doc(db, "departmentStats", departmentId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Get all department stats (for the Reports screen bar chart).
 */
export async function getAllDepartmentStats() {
  const snap = await getDocs(collection(db, "departmentStats"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
