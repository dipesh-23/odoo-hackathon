/**
 * Department Service
 *
 * CRUD for `departments/{departmentId}`.
 * employeeCount is maintained via FieldValue.increment by the client
 * action that adds/removes/moves an employee.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  getDocs,
  query,
  where,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Create a new department.
 *
 * @param {Object} params
 * @param {string} params.name
 * @param {string} params.code             - unique dept code
 * @param {string|null} params.headUserId
 * @param {string|null} params.headName     - denormalized
 * @param {string|null} params.parentDepartmentId
 */
export async function createDepartment({
  name,
  code,
  headUserId = null,
  headName = null,
  parentDepartmentId = null,
}) {
  return addDoc(collection(db, "departments"), {
    name,
    code,
    headUserId,
    headName,
    parentDepartmentId,
    employeeCount: 0,
    status: "Active",
    createdAt: serverTimestamp(),
  });
}

/**
 * Read a single department.
 */
export async function getDepartment(departmentId) {
  const snap = await getDoc(doc(db, "departments", departmentId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Partial update of department fields.
 */
export async function updateDepartment(departmentId, data) {
  return updateDoc(doc(db, "departments", departmentId), data);
}

/**
 * Increment or decrement the employee count on a department.
 * Call this in the same batch/transaction that modifies the user's departmentId.
 *
 * @param {string} departmentId
 * @param {number} delta - +1 or -1
 */
export async function changeEmployeeCount(departmentId, delta) {
  return updateDoc(doc(db, "departments", departmentId), {
    employeeCount: increment(delta),
  });
}

/**
 * Increment/decrement within an existing batch or transaction.
 */
export function changeEmployeeCountInBatch(batchOrTxn, departmentId, delta) {
  const ref = doc(db, "departments", departmentId);
  batchOrTxn.update(ref, { employeeCount: increment(delta) });
}

/**
 * List all departments (optionally filtered by status).
 */
export async function listDepartments({ status = null } = {}) {
  const constraints = [];
  if (status) {
    constraints.push(where("status", "==", status));
  }

  const q = query(collection(db, "departments"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get all active departments (for dropdowns).
 */
export async function getActiveDepartments() {
  return listDepartments({ status: "Active" });
}
