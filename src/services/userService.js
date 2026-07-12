/**
 * User Service
 *
 * CRUD for `users/{uid}`. The doc ID is the Firebase Auth UID.
 * On signup the client always writes `role = "Employee"` — Security Rules
 * enforce this, rejecting any other role at create time.
 *
 * Role promotion is a single-field update gated by a Security Rule
 * checking the caller's own role == "Admin".
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Create the Firestore user profile document after Firebase Auth signup.
 * Always sets role = "Employee" (enforced by Security Rules too).
 *
 * @param {string} uid - Firebase Auth UID (used as doc ID)
 * @param {Object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string|null} params.departmentId
 * @param {string|null} params.departmentName - denormalized
 */
export async function createUserProfile(uid, {
  name,
  email,
  departmentId = null,
  departmentName = null,
}) {
  return setDoc(doc(db, "users", uid), {
    name: name || "",
    email,
    departmentId,
    departmentName,
    role: "Employee",
    status: "Active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Read a single user profile.
 */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Partial update of user fields (name, departmentId, status, etc.).
 * Does NOT allow role changes — use promoteUser() for that.
 */
export async function updateUserProfile(uid, data) {
  // Strip role from update data as a safety measure
  const { role, ...safeData } = data;
  return updateDoc(doc(db, "users", uid), {
    ...safeData,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Promote or change a user's role.
 * In production Security Rules enforce that the caller's own
 * users/{request.auth.uid}.role == "Admin".
 *
 * @param {string} callerUid - uid of the admin performing the action
 * @param {string} targetUid - uid of the user being promoted
 * @param {string} newRole   - "Employee" | "DepartmentHead" | "AssetManager" | "Admin"
 */
export async function promoteUser(callerUid, targetUid, newRole) {
  const validRoles = ["Employee", "DepartmentHead", "AssetManager", "Admin"];
  if (!validRoles.includes(newRole)) {
    throw new Error(`Invalid role: "${newRole}". Must be one of: ${validRoles.join(", ")}`);
  }

  return updateDoc(doc(db, "users", targetUid), {
    role: newRole,
    updatedAt: serverTimestamp(),
  });
}

/**
 * List users with optional filters.
 *
 * @param {Object} opts
 * @param {string|null} opts.departmentId
 * @param {string|null} opts.role
 * @param {string|null} opts.status
 */
export async function listUsers({
  departmentId = null,
  role = null,
  status = null,
} = {}) {
  const constraints = [];

  if (departmentId) constraints.push(where("departmentId", "==", departmentId));
  if (role) constraints.push(where("role", "==", role));
  if (status) constraints.push(where("status", "==", status));

  constraints.push(orderBy("createdAt", "desc"));

  const q = query(collection(db, "users"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get all active employees (for dropdowns/assignment selectors).
 */
export async function getActiveEmployees() {
  return listUsers({ status: "Active" });
}
