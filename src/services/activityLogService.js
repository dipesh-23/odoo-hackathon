/**
 * Activity Log Service
 *
 * Append-only audit trail. Every action function must call
 * addActivityLogInBatch() to bundle the log write into the same
 * transaction/batch as the primary action — there is no background
 * trigger to catch missed writes.
 */

import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Adds an activity-log doc write to an existing WriteBatch or Transaction.
 *
 * @param {WriteBatch|Transaction} batchOrTxn
 * @param {Object} params
 * @param {string} params.actorUserId
 * @param {string} params.actorName
 * @param {string} params.action        - e.g. "ASSET_ALLOCATED", "MAINTENANCE_APPROVED"
 * @param {string} params.targetCollection
 * @param {string} params.targetDocId
 * @param {Object} params.metadata      - free-form details of what changed
 */
export function addActivityLogInBatch(batchOrTxn, {
  actorUserId,
  actorName,
  action,
  targetCollection,
  targetDocId,
  metadata = {},
}) {
  const ref = doc(collection(db, "activityLogs"));

  batchOrTxn.set(ref, {
    actorUserId,
    actorName,
    action,
    targetCollection,
    targetDocId,
    metadata,
    timestamp: serverTimestamp(),
  });

  return ref.id;
}

/**
 * Query activity logs — optionally scoped to a specific target document.
 *
 * @param {Object} opts
 * @param {string|null}  opts.targetCollection
 * @param {string|null}  opts.targetDocId
 * @param {number}       opts.maxResults  - default 50
 * @param {DocumentSnapshot|null} opts.afterDoc - for pagination
 */
export async function getActivityLogs({
  targetCollection = null,
  targetDocId = null,
  maxResults = 50,
  afterDoc = null,
} = {}) {
  const constraints = [];

  if (targetCollection) {
    constraints.push(where("targetCollection", "==", targetCollection));
  }
  if (targetDocId) {
    constraints.push(where("targetDocId", "==", targetDocId));
  }

  constraints.push(orderBy("timestamp", "desc"));

  if (afterDoc) {
    constraints.push(startAfter(afterDoc));
  }

  constraints.push(limit(maxResults));

  const q = query(collection(db, "activityLogs"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get recent activity for the dashboard feed.
 */
export async function getRecentActivity(maxResults = 20) {
  return getActivityLogs({ maxResults });
}
