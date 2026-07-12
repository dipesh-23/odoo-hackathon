/**
 * Asset Service
 *
 * CRUD for `assets/{assetId}`, plus history subcollection writes and
 * stats subcollection management. Auto-generates asset tags (AF-0001).
 * QR code data URLs are generated via the `qrcode` library.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  increment,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import QRCode from "qrcode";
import { db } from "../firebase";
import { addActivityLogInBatch } from "./activityLogService";

// ─── Asset Tag Generation ───────────────────────────────────────────────────
// Uses a counter document at `counters/assetTag` to guarantee uniqueness.
// Falls back to querying the max existing tag if the counter doc doesn't exist.

async function getNextAssetTag() {
  const counterRef = doc(db, "counters", "assetTag");
  const counterSnap = await getDoc(counterRef);

  let nextNum;
  if (counterSnap.exists()) {
    nextNum = (counterSnap.data().current || 0) + 1;
  } else {
    // Bootstrap: find the highest existing tag
    const q = query(
      collection(db, "assets"),
      orderBy("assetTag", "desc"),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      nextNum = 1;
    } else {
      const lastTag = snap.docs[0].data().assetTag; // e.g. "AF-0042"
      const num = parseInt(lastTag.replace("AF-", ""), 10);
      nextNum = (isNaN(num) ? 0 : num) + 1;
    }
  }

  // Update counter
  await setDoc(counterRef, { current: nextNum });

  return `AF-${String(nextNum).padStart(4, "0")}`;
}

/**
 * Generate a QR code data URL for an asset tag.
 */
async function generateQrCode(assetTag) {
  try {
    return await QRCode.toDataURL(assetTag, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    console.warn("QR code generation failed for", assetTag);
    return null;
  }
}

/**
 * Add a history event to the asset's history subcollection.
 * Can be called standalone or the caller can add it to a batch.
 */
export function addAssetHistoryInBatch(batchOrTxn, assetId, {
  type,
  refId,
  description,
  actorUserId,
}) {
  const ref = doc(collection(db, "assets", assetId, "history"));
  batchOrTxn.set(ref, {
    type,
    refId: refId || "",
    description,
    actorUserId,
    timestamp: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Initialize or reset the stats/summary subdoc for an asset.
 */
export async function initAssetStats(assetId) {
  return setDoc(doc(db, "assets", assetId, "stats", "summary"), {
    bookingCountTotal: 0, // using total instead of 30d — see schema note
    tripCount30d: 0,
    maintenanceCount: 0,
    lastUsedAt: null,
    updatedAt: serverTimestamp(),
  });
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

/**
 * Create a new asset.
 *
 * @param {Object} data     - asset fields (name, categoryId, categoryName, serialNumber, etc.)
 * @param {Object} actorUser - { uid, name } of the acting user
 * @returns {Object} { id, assetTag }
 */
export async function createAsset(data, actorUser) {
  const assetTag = await getNextAssetTag();
  const qrCodeUrl = await generateQrCode(assetTag);

  const batch = writeBatch(db);

  const assetRef = doc(collection(db, "assets"));
  const assetData = {
    assetTag,
    name: data.name || "",
    categoryId: data.categoryId || null,
    categoryName: data.categoryName || null,
    serialNumber: data.serialNumber || "",
    acquisitionDate: data.acquisitionDate || null,
    acquisitionCost: data.acquisitionCost || 0,
    condition: data.condition || "New",
    location: data.location || "",
    photoUrl: data.photoUrl || null,
    documentUrls: data.documentUrls || [],
    isBookable: data.isBookable || false,
    status: "Available",
    currentHolderId: null,
    currentHolderName: null,
    currentHolderType: null,
    departmentId: null,
    departmentName: null,
    qrCodeUrl,
    nextServiceDueDate: data.nextServiceDueDate || null,
    retirementThresholdYears: data.retirementThresholdYears || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  batch.set(assetRef, assetData);

  // History event
  addAssetHistoryInBatch(batch, assetRef.id, {
    type: "Allocation",
    refId: assetRef.id,
    description: `Asset "${data.name}" created with tag ${assetTag}`,
    actorUserId: actorUser.uid,
  });

  // Activity log
  addActivityLogInBatch(batch, {
    actorUserId: actorUser.uid,
    actorName: actorUser.name || "",
    action: "ASSET_CREATED",
    targetCollection: "assets",
    targetDocId: assetRef.id,
    metadata: { assetTag, name: data.name },
  });

  await batch.commit();

  // Initialize stats subdoc (separate write — non-critical if it fails)
  await initAssetStats(assetRef.id).catch(console.warn);

  return { id: assetRef.id, assetTag };
}

/**
 * Read a single asset.
 */
export async function getAsset(assetId) {
  const snap = await getDoc(doc(db, "assets", assetId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Partial update of asset fields.
 */
export async function updateAsset(assetId, data, actorUser) {
  const batch = writeBatch(db);

  batch.update(doc(db, "assets", assetId), {
    ...data,
    updatedAt: serverTimestamp(),
  });

  addAssetHistoryInBatch(batch, assetId, {
    type: "AuditFlag",
    refId: assetId,
    description: `Asset updated: ${Object.keys(data).join(", ")}`,
    actorUserId: actorUser.uid,
  });

  addActivityLogInBatch(batch, {
    actorUserId: actorUser.uid,
    actorName: actorUser.name || "",
    action: "ASSET_UPDATED",
    targetCollection: "assets",
    targetDocId: assetId,
    metadata: data,
  });

  return batch.commit();
}

/**
 * List assets with optional filters.
 *
 * @param {Object} opts
 * @param {string|null} opts.status
 * @param {string|null} opts.categoryId
 * @param {string|null} opts.location
 * @param {boolean|null} opts.isBookable
 * @param {number}      opts.maxResults
 */
export async function listAssets({
  status = null,
  categoryId = null,
  location = null,
  isBookable = null,
  maxResults = 100,
} = {}) {
  const constraints = [];

  if (status) constraints.push(where("status", "==", status));
  if (categoryId) constraints.push(where("categoryId", "==", categoryId));
  if (location) constraints.push(where("location", "==", location));
  if (isBookable !== null) constraints.push(where("isBookable", "==", isBookable));

  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(maxResults));

  const q = query(collection(db, "assets"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get bookable assets (for the booking screen).
 */
export async function getBookableAssets() {
  return listAssets({ isBookable: true, status: "Available" });
}

/**
 * Read the asset's history subcollection.
 */
export async function getAssetHistory(assetId) {
  const q = query(
    collection(db, "assets", assetId, "history"),
    orderBy("timestamp", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Read the asset's stats/summary doc.
 */
export async function getAssetStats(assetId) {
  const snap = await getDoc(doc(db, "assets", assetId, "stats", "summary"));
  if (!snap.exists()) return null;
  return snap.data();
}

/**
 * Increment a stats counter on an asset (e.g. bookingCountTotal).
 * Used by booking/maintenance services.
 */
export function incrementAssetStatInBatch(batchOrTxn, assetId, field, delta = 1) {
  const ref = doc(db, "assets", assetId, "stats", "summary");
  batchOrTxn.set(ref, {
    [field]: increment(delta),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
