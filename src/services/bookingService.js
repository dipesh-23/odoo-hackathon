/**
 * Booking Service
 *
 * Handles creation, cancellation, and querying of resource bookings.
 * Overlap detection: query `resourceId` where `startTime < newEnd`,
 * then filter client-side for `endTime > newStart`.
 *
 * Atomicity: pre-check query + runTransaction on the booking write.
 * This is weaker than a server-side check (see schema.md §7 note).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { createNotificationInBatch } from "./notificationService";
import { addActivityLogInBatch } from "./activityLogService";

/**
 * Check for overlapping bookings on a resource.
 * Returns an array of conflicting bookings (empty if none).
 *
 * Firestore can't do range-on-two-fields, so we query
 * `startTime < newEnd` and filter `endTime > newStart` client-side.
 */
async function findOverlappingBookings(resourceId, newStart, newEnd) {
  const q = query(
    collection(db, "bookings"),
    where("resourceId", "==", resourceId),
    where("status", "in", ["Upcoming", "Ongoing"]),
    where("startTime", "<", newEnd),
    orderBy("startTime", "asc")
  );
  const snap = await getDocs(q);

  return snap.docs
    .filter((d) => {
      const data = d.data();
      // Client-side half of the overlap check
      const bookingEnd = data.endTime?.toDate ? data.endTime.toDate() : new Date(data.endTime);
      const startCheck = newStart instanceof Date ? newStart : new Date(newStart);
      return bookingEnd > startCheck;
    })
    .map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Create a new booking.
 *
 * @param {Object} params
 * @param {string} params.resourceId      - asset ID (where isBookable == true)
 * @param {string} params.resourceName    - denormalized
 * @param {string} params.bookedByUserId
 * @param {string} params.bookedByName    - denormalized
 * @param {string|null} params.departmentId
 * @param {Date|Timestamp} params.startTime
 * @param {Date|Timestamp} params.endTime
 * @param {string} params.purpose
 * @param {Object} actorUser - { uid, name }
 * @returns {Object} { id }
 */
export async function createBooking({
  resourceId,
  resourceName,
  bookedByUserId,
  bookedByName,
  departmentId = null,
  startTime,
  endTime,
  purpose,
}, actorUser) {
  // Pre-check for conflicts
  const conflicts = await findOverlappingBookings(resourceId, startTime, endTime);
  if (conflicts.length > 0) {
    const conflictInfo = conflicts
      .map((c) => `${c.bookedByName} (${c.startTime?.toDate?.().toLocaleString() || c.startTime})`)
      .join(", ");
    throw new Error(`Time slot conflicts with existing booking(s): ${conflictInfo}`);
  }

  // Transaction write
  const bookingRef = doc(collection(db, "bookings"));
  await runTransaction(db, async (txn) => {
    txn.set(bookingRef, {
      resourceId,
      resourceName,
      bookedByUserId,
      bookedByName,
      departmentId,
      startTime,
      endTime,
      purpose,
      status: "Upcoming",
      createdAt: serverTimestamp(),
    });

    // Increment booking count in asset stats
    const statsRef = doc(db, "assets", resourceId, "stats", "summary");
    txn.set(statsRef, {
      bookingCountTotal: increment(1),
      lastUsedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // Notification to the booker
    createNotificationInBatch(txn, {
      userId: bookedByUserId,
      type: "BookingConfirmed",
      title: "Booking Confirmed",
      message: `Your booking for ${resourceName} has been confirmed`,
      relatedRefId: bookingRef.id,
    });

    // Activity log
    addActivityLogInBatch(txn, {
      actorUserId: actorUser.uid,
      actorName: actorUser.name || "",
      action: "BOOKING_CREATED",
      targetCollection: "bookings",
      targetDocId: bookingRef.id,
      metadata: { resourceId, resourceName, startTime, endTime, purpose },
    });
  });

  return { id: bookingRef.id };
}

/**
 * Cancel a booking.
 */
export async function cancelBooking(bookingId, actorUser) {
  await runTransaction(db, async (txn) => {
    const bookingSnap = await txn.get(doc(db, "bookings", bookingId));
    if (!bookingSnap.exists()) throw new Error("Booking not found.");
    const bookingData = bookingSnap.data();

    if (bookingData.status === "Cancelled") {
      throw new Error("Booking is already cancelled.");
    }
    if (bookingData.status === "Completed") {
      throw new Error("Cannot cancel a completed booking.");
    }

    txn.update(doc(db, "bookings", bookingId), {
      status: "Cancelled",
    });

    // Notification
    createNotificationInBatch(txn, {
      userId: bookingData.bookedByUserId,
      type: "BookingCancelled",
      title: "Booking Cancelled",
      message: `Your booking for ${bookingData.resourceName} has been cancelled`,
      relatedRefId: bookingId,
    });

    // Activity log
    addActivityLogInBatch(txn, {
      actorUserId: actorUser.uid,
      actorName: actorUser.name || "",
      action: "BOOKING_CANCELLED",
      targetCollection: "bookings",
      targetDocId: bookingId,
      metadata: {
        resourceId: bookingData.resourceId,
        resourceName: bookingData.resourceName,
      },
    });
  });
}

/**
 * Delete a booking permanently.
 */
export async function deleteBooking(bookingId) {
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db, "bookings", bookingId));
}

/**
 * Complete a booking (mark as done).
 */
export async function completeBooking(bookingId) {
  return updateDoc(doc(db, "bookings", bookingId), {
    status: "Completed",
  });
}

/**
 * List bookings with optional filters.
 *
 * @param {Object} opts
 * @param {string|null} opts.resourceId
 * @param {string|null} opts.bookedByUserId
 * @param {string|null} opts.status
 * @param {number}      opts.maxResults
 */
export async function listBookings({
  resourceId = null,
  bookedByUserId = null,
  status = null,
  maxResults = 50,
} = {}) {
  const constraints = [];

  if (resourceId) constraints.push(where("resourceId", "==", resourceId));
  if (bookedByUserId) constraints.push(where("bookedByUserId", "==", bookedByUserId));
  if (status) constraints.push(where("status", "==", status));

  constraints.push(limit(maxResults));

  const q = query(collection(db, "bookings"), ...constraints);
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  
  docs.sort((a, b) => {
    const timeA = a.startTime?.toMillis ? a.startTime.toMillis() : 0;
    const timeB = b.startTime?.toMillis ? b.startTime.toMillis() : 0;
    return timeB - timeA;
  });
  
  return docs;
}

/**
 * Get upcoming bookings for a user (for the dashboard / reminders).
 */
export async function getUpcomingBookings(userId) {
  const now = new Date();
  const q = query(
    collection(db, "bookings"),
    where("bookedByUserId", "==", userId),
    where("status", "==", "Upcoming")
  );
  const snap = await getDocs(q);
  
  const docs = [];
  snap.forEach(d => {
    const data = d.data();
    if (data.startTime) {
      const start = data.startTime.toDate ? data.startTime.toDate() : new Date(data.startTime);
      if (start > now) {
        docs.push({ id: d.id, ...data });
      }
    }
  });

  docs.sort((a, b) => {
    const timeA = a.startTime?.toMillis ? a.startTime.toMillis() : 0;
    const timeB = b.startTime?.toMillis ? b.startTime.toMillis() : 0;
    return timeA - timeB;
  });

  return docs.slice(0, 10);
}

/**
 * Get a single booking.
 */
export async function getBooking(bookingId) {
  const snap = await getDoc(doc(db, "bookings", bookingId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
