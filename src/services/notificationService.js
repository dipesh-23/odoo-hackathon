/**
 * Notification Service
 *
 * Handles creation and querying of in-app notifications.
 * Every action function (allocate, book, maintain, etc.) should call
 * createNotificationInBatch() to bundle the notification write into
 * the same transaction/batch as the primary action.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Type → Category mapping (per schema.md §10) ────────────────────────────
const TYPE_CATEGORY_MAP = {
  AssetAssigned: "Alert",
  OverdueReturn: "Alert",
  AuditDiscrepancy: "Alert",
  MaintenanceApproved: "Approval",
  MaintenanceRejected: "Approval",
  TransferApproved: "Approval",
  BookingConfirmed: "Booking",
  BookingCancelled: "Booking",
  BookingReminder: "Booking",
};

/**
 * Adds a notification doc write to an existing WriteBatch or Transaction.
 * Call this inside every action function so the notification is atomic
 * with the primary write.
 *
 * @param {WriteBatch|Transaction} batchOrTxn
 * @param {Object} params
 * @param {string} params.userId       - recipient uid
 * @param {string} params.type         - one of the TYPE_CATEGORY_MAP keys
 * @param {string} params.title
 * @param {string} params.message
 * @param {string|null} params.relatedRefId - id of the source doc
 */
export function createNotificationInBatch(batchOrTxn, {
  userId,
  type,
  title,
  message,
  relatedRefId = null,
}) {
  const category = TYPE_CATEGORY_MAP[type] || "Alert";
  const ref = doc(collection(db, "notifications"));

  const data = {
    userId,
    type,
    category,
    title,
    message,
    relatedRefId,
    isRead: false,
    createdAt: serverTimestamp(),
  };

  // WriteBatch uses .set(), Transaction uses .set() too
  batchOrTxn.set(ref, data);
  return ref.id;
}

/**
 * Standalone create (when a batch/transaction isn't available).
 */
export async function createNotification({
  userId,
  type,
  title,
  message,
  relatedRefId = null,
}) {
  const category = TYPE_CATEGORY_MAP[type] || "Alert";

  return addDoc(collection(db, "notifications"), {
    userId,
    type,
    category,
    title,
    message,
    relatedRefId,
    isRead: false,
    createdAt: serverTimestamp(),
  });
}

/**
 * Fetch notifications for a user.
 *
 * @param {string} userId
 * @param {Object} opts
 * @param {string|null} opts.category   - "Alert" | "Approval" | "Booking" | null (all)
 * @param {boolean}     opts.unreadOnly - if true, only unread
 * @param {number}      opts.maxResults - default 50
 */
export async function getNotifications(userId, {
  category = null,
  unreadOnly = false,
  maxResults = 50,
} = {}) {
  const constraints = [where("userId", "==", userId)];

  if (category) {
    constraints.push(where("category", "==", category));
  }
  if (unreadOnly) {
    constraints.push(where("isRead", "==", false));
  }

  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(maxResults));

  const q = query(collection(db, "notifications"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(notificationId) {
  return updateDoc(doc(db, "notifications", notificationId), {
    isRead: true,
  });
}

/**
 * Mark all of a user's notifications as read (batch write, max 500).
 */
export async function markAllAsRead(userId) {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    where("isRead", "==", false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.update(d.ref, { isRead: true });
  });
  return batch.commit();
}

/**
 * Get unread notification count for badge display.
 */
export async function getUnreadCount(userId) {
  const q = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    where("isRead", "==", false)
  );
  const snap = await getDocs(q);
  return snap.size;
}
