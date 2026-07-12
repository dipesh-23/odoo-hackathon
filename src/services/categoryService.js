/**
 * Category Service
 *
 * CRUD for `categories/{categoryId}`.
 * Categories define asset types (e.g. "Electronics", "Furniture")
 * and optional custom fields (e.g. warrantyPeriodMonths).
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
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Create a new category.
 *
 * @param {Object} params
 * @param {string} params.name           - e.g. "Electronics", "Furniture"
 * @param {Object} params.customFields   - free-form map, e.g. { warrantyPeriodMonths: 12 }
 */
export async function createCategory({ name, customFields = {} }) {
  return addDoc(collection(db, "categories"), {
    name,
    customFields,
    status: "Active",
    createdAt: serverTimestamp(),
  });
}

/**
 * Read a single category.
 */
export async function getCategory(categoryId) {
  const snap = await getDoc(doc(db, "categories", categoryId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Partial update of category fields.
 */
export async function updateCategory(categoryId, data) {
  return updateDoc(doc(db, "categories", categoryId), data);
}

/**
 * List categories (optionally filtered by status).
 */
export async function listCategories({ status = null } = {}) {
  // Fetch ALL docs — no server-side where/orderBy so no indexes are needed
  const snap = await getDocs(collection(db, "categories"));
  let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (status) docs = docs.filter((d) => d.status === status);
  docs.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return docs;
}

/**
 * Get all active categories (for dropdowns).
 */
export async function getActiveCategories() {
  return listCategories({ status: "Active" });
}
