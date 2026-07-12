/**
 * Report Service
 *
 * Encapsulates the queries needed for the Reports & Analytics screen.
 * These are read-only aggregations.
 */

import {
  collection,
  collectionGroup,
  query,
  orderBy,
  limit,
  getDocs,
  getDoc,
  where,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Get top 3 most used assets based on bookingCount30d from their stats subcollection.
 * Uses a collection-group query on 'stats'.
 */
export async function getMostUsedAssets() {
  const snap = await getDocs(collection(db, "assets"));
  const results = await Promise.all(snap.docs.map(async (d) => {
    const statSnap = await getDoc(doc(db, "assets", d.id, "stats", "summary"));
    const statData = statSnap.exists() ? statSnap.data() : {};
    const assetData = d.data();
    return {
      assetId: d.id,
      name: assetData.name || assetData.tag || "Unknown Asset",
      bookingCount30d: statData.bookingCount30d || 0,
    };
  }));
  
  return results.sort((a, b) => b.bookingCount30d - a.bookingCount30d).slice(0, 3);
}

/**
 * Get top 3 idle assets based on lastUsedAt ascending.
 * Null lastUsedAt is technically older than any date.
 */
export async function getIdleAssets() {
  const snap = await getDocs(collection(db, "assets"));
  const results = await Promise.all(snap.docs.map(async (d) => {
    const statSnap = await getDoc(doc(db, "assets", d.id, "stats", "summary"));
    const statData = statSnap.exists() ? statSnap.data() : {};
    const assetData = d.data();
    return {
      assetId: d.id,
      name: assetData.name || assetData.tag || "Unknown Asset",
      lastUsedAt: statData.lastUsedAt || null,
    };
  }));

  // Sort ascending by time. Null lastUsedAt is treated as 0 (oldest).
  return results.sort((a, b) => {
    const timeA = a.lastUsedAt?.toDate ? a.lastUsedAt.toDate().getTime() : 0;
    const timeB = b.lastUsedAt?.toDate ? b.lastUsedAt.toDate().getTime() : 0;
    return timeA - timeB;
  }).slice(0, 3);
}

/**
 * Get assets where nextServiceDueDate is <= now + 7 days.
 */
export async function getAssetsDueForMaintenance() {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const q = query(
    collection(db, "assets"),
    where("nextServiceDueDate", "<=", nextWeek)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get active assets nearing retirement (within ~1 year).
 * Client-side filter applied due to derived math.
 * Fallback to 5 years if retirementThresholdYears is null.
 */
export async function getAssetsNearingRetirement() {
  // Get assets that are not retired/disposed
  const q = query(
    collection(db, "assets"),
    where("status", "in", ["Available", "Allocated", "Reserved", "UnderMaintenance"])
  );
  const snap = await getDocs(q);
  const activeAssets = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const now = new Date();
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  return activeAssets.filter(asset => {
    if (!asset.acquisitionDate) return false;
    
    // Convert to JS Date
    const acqDate = asset.acquisitionDate.toDate ? asset.acquisitionDate.toDate() : new Date(asset.acquisitionDate);
    
    // Flat 5-year fallback for hackathon demo
    const thresholdYears = asset.retirementThresholdYears || 5;
    
    const retirementDate = new Date(acqDate);
    retirementDate.setFullYear(retirementDate.getFullYear() + thresholdYears);

    // If it's retiring within the next 365 days (or already past it)
    return retirementDate <= oneYearFromNow;
  });
}

/**
 * Fetches discrepancy reports for all closed audit cycles.
 * Avoids collectionGroup and orderBy to prevent requiring a custom composite index.
 */
export async function getAuditDiscrepancyReports() {
  const q = query(
    collection(db, "auditCycles"),
    where("status", "==", "Closed")
  );

  const snap = await getDocs(q);
  if (snap.empty) return [];

  const cycles = [];
  for (const doc of snap.docs) {
    cycles.push({ id: doc.id, ...doc.data() });
  }
  
  // Sort descending locally
  cycles.sort((a, b) => {
    const timeA = a.closedAt?.toDate ? a.closedAt.toDate().getTime() : 0;
    const timeB = b.closedAt?.toDate ? b.closedAt.toDate().getTime() : 0;
    return timeB - timeA;
  });

  const reports = [];
  for (const cycleData of cycles.slice(0, 10)) {
    // Fetch the summary doc for this cycle
    const summaryRef = doc(db, "auditCycles", cycleData.id, "discrepancyReport", "summary");
    const summarySnap = await getDoc(summaryRef);
    
    if (summarySnap.exists()) {
      const summaryData = summarySnap.data();
      reports.push({
        id: cycleData.id,
        scopeType: cycleData.scopeType || "Audit",
        scopeValue: cycleData.scopeValue || cycleData.scopeType || "All",
        closedAt: cycleData.closedAt?.toDate ? cycleData.closedAt.toDate() : new Date(),
        totalAssetsChecked: summaryData.totalAssetsChecked || 0,
        missingCount: summaryData.missingCount || 0,
        damagedCount: summaryData.damagedCount || 0,
        generatedAt: summaryData.generatedAt?.toDate ? summaryData.generatedAt.toDate() : new Date()
      });
    }
  }

  return reports;
}
