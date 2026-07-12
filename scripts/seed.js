import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.resolve(__dirname, "../serviceAccountKey.json");

const projectId = "oddo-hackathon-123";
let app;

try {
  if (fs.existsSync(serviceAccountPath)) {
    console.log("Found serviceAccountKey.json, initializing with certificate...");
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    app = initializeApp({ credential: cert(serviceAccount) });
  } else {
    console.log("No serviceAccountKey.json found. Attempting to use Application Default Credentials...");
    app = initializeApp({ projectId });
  }
} catch (error) {
  console.error("\n❌ Firebase Admin SDK Initialization Failed!");
  console.error("The Admin SDK requires elevated privileges to seed the database.");
  console.error("\nHOW TO FIX:");
  console.error("1. Go to Firebase Console -> Project Settings -> Service Accounts");
  console.error("2. Click 'Generate new private key'");
  console.error("3. Save the downloaded file as 'serviceAccountKey.json' in the ROOT of this project (e:/Odoo_Hack/).");
  console.error("4. Run `node scripts/seed.js` again.");
  console.error("\nAlternatively, install Google Cloud CLI and run: `gcloud auth application-default login`\n");
  process.exit(1);
}

const db = getFirestore(app);

const LOCATIONS = ["Headquarters", "Warehouse", "HQ Floor 2"];
const DEPARTMENTS = [
  { id: "eng", name: "Engineering" },
  { id: "fac", name: "Facilities" },
  { id: "fieldops", name: "Field Ops (East)" }
];
const CATEGORIES = ["Electronics", "Furniture", "Vehicles"];

async function seed() {
  console.log("Starting seed process...");

  // 2. USERS
  const usersRef = db.collection("users");
  const adminId = "user_admin";
  const managerId = "user_manager";
  const emp1Id = "user_emp1";
  const emp2Id = "user_emp2";

  await usersRef.doc(adminId).set({
    name: "Admin Alice", email: "alice@example.com", role: "Admin",
    departmentId: "eng", departmentName: "Engineering", createdAt: FieldValue.serverTimestamp()
  });
  await usersRef.doc(managerId).set({
    name: "Manager Bob", email: "bob@example.com", role: "AssetManager",
    departmentId: "fac", departmentName: "Facilities", createdAt: FieldValue.serverTimestamp()
  });
  await usersRef.doc(emp1Id).set({
    name: "Employee Charlie", email: "charlie@example.com", role: "Employee",
    departmentId: "eng", departmentName: "Engineering", createdAt: FieldValue.serverTimestamp()
  });
  await usersRef.doc(emp2Id).set({
    name: "Employee Dave", email: "dave@example.com", role: "Employee",
    departmentId: "fieldops", departmentName: "Field Ops (East)", createdAt: FieldValue.serverTimestamp()
  });

  // 3. DEPARTMENTS
  const deptsRef = db.collection("departments");
  await deptsRef.doc("eng").set({ name: "Engineering", headUserId: adminId, headUserName: "Admin Alice" });
  await deptsRef.doc("fac").set({ name: "Facilities", headUserId: managerId, headUserName: "Manager Bob" });
  await deptsRef.doc("fieldops").set({ name: "Field Ops (East)", headUserId: emp2Id, headUserName: "Employee Dave" });

  // 4. CATEGORIES
  const catsRef = db.collection("categories");
  await catsRef.doc("Electronics").set({
    name: "Electronics",
    customFields: { warrantyPeriodMonths: 12, retirementYears: 3 }
  });
  await catsRef.doc("Furniture").set({
    name: "Furniture",
    customFields: { retirementYears: 10 }
  });
  await catsRef.doc("Vehicles").set({
    name: "Vehicles",
    customFields: { retirementYears: 5 }
  });

  // 5. ASSETS
  const assetsRef = db.collection("assets");
  const now = new Date();
  
  const past3Years = new Date(now.getTime() - (2.9 * 365 * 24 * 60 * 60 * 1000));
  const next4Days = new Date(now.getTime() + (4 * 24 * 60 * 60 * 1000));
  const next6Days = new Date(now.getTime() + (6 * 24 * 60 * 60 * 1000));

  const assets = [
    // Allocated
    { id: "A-001", tag: "AF-001", cat: "Electronics", loc: "Headquarters", status: "Allocated", holder: emp1Id, holderName: "Employee Charlie", isBookable: false },
    { id: "A-002", tag: "AF-002", cat: "Furniture", loc: "Warehouse", status: "Allocated", holder: emp2Id, holderName: "Employee Dave", isBookable: false, overdue: true },
    { id: "A-003", tag: "AF-003", cat: "Vehicles", loc: "HQ Floor 2", status: "Allocated", holder: managerId, holderName: "Manager Bob", isBookable: false },
    
    // Available (Bookable)
    { id: "A-004", tag: "AF-004", cat: "Electronics", loc: "Headquarters", status: "Available", isBookable: true, maintDue: next4Days },
    { id: "A-005", tag: "AF-005", cat: "Furniture", loc: "HQ Floor 2", status: "Available", isBookable: true },
    { id: "A-006", tag: "AF-006", cat: "Vehicles", loc: "Warehouse", status: "Available", isBookable: true, maintDue: next6Days },
    
    // Available (Non-Bookable)
    { id: "A-007", tag: "AF-007", cat: "Electronics", loc: "Headquarters", status: "Available", isBookable: false, acqDate: past3Years },
    { id: "A-008", tag: "AF-008", cat: "Furniture", loc: "Warehouse", status: "Available", isBookable: false },
    { id: "A-009", tag: "AF-009", cat: "Electronics", loc: "Headquarters", status: "Available", isBookable: false },

    // UnderMaintenance
    { id: "A-010", tag: "AF-010", cat: "Electronics", loc: "Headquarters", status: "UnderMaintenance", isBookable: false },
    { id: "A-011", tag: "AF-011", cat: "Vehicles", loc: "Warehouse", status: "UnderMaintenance", isBookable: false },
    { id: "A-012", tag: "AF-012", cat: "Furniture", loc: "HQ Floor 2", status: "UnderMaintenance", isBookable: false },
    
    // Lost
    { id: "A-013", tag: "AF-013", cat: "Electronics", loc: "Headquarters", status: "Lost", isBookable: false },
    
    // Retired
    { id: "A-014", tag: "AF-014", cat: "Vehicles", loc: "Warehouse", status: "Retired", isBookable: false }
  ];

  for (const a of assets) {
    const data = {
      assetTag: a.tag,
      name: `${a.cat} Item ${a.tag}`,
      categoryName: a.cat,
      location: a.loc,
      status: a.status,
      isBookable: a.isBookable,
      acquisitionDate: Timestamp.fromDate(a.acqDate || new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000)),
      createdAt: FieldValue.serverTimestamp(),
    };
    if (a.holder) {
      data.currentHolderId = a.holder;
      data.currentHolderType = "Employee";
      data.currentHolderName = a.holderName;
    }
    if (a.maintDue) {
      data.nextServiceDueDate = Timestamp.fromDate(a.maintDue);
    }
    await assetsRef.doc(a.id).set(data);
  }

  // 6. ASSET STATS
  const statsMap = [
    { id: "A-001", bookings: 12, lastUsed: new Date(now.getTime() - 1 * 24*60*60*1000) },
    { id: "A-004", bookings: 8, lastUsed: new Date(now.getTime() - 2 * 24*60*60*1000) },
    { id: "A-005", bookings: 5, lastUsed: new Date(now.getTime() - 5 * 24*60*60*1000) },
    { id: "A-006", bookings: 1, lastUsed: new Date(now.getTime() - 25 * 24*60*60*1000) },
    { id: "A-007", bookings: 0, lastUsed: new Date(now.getTime() - 40 * 24*60*60*1000) }
  ];
  for (const s of statsMap) {
    await assetsRef.doc(s.id).collection("stats").doc("summary").set({
      bookingCount30d: s.bookings,
      lastUsedAt: Timestamp.fromDate(s.lastUsed),
      updatedAt: FieldValue.serverTimestamp()
    });
  }

  // 7. DEPARTMENT STATS
  const deptStatsRef = db.collection("departmentStats");
  await deptStatsRef.doc("eng").set({ utilizationScore: 85, lastUpdated: FieldValue.serverTimestamp() });
  await deptStatsRef.doc("fac").set({ utilizationScore: 60, lastUpdated: FieldValue.serverTimestamp() });
  await deptStatsRef.doc("fieldops").set({ utilizationScore: 40, lastUpdated: FieldValue.serverTimestamp() });

  // 8. ALLOCATIONS
  const allocsRef = db.collection("allocations");
  const allocs = [
    { id: "AL-1", assetId: "A-001", tag: "AF-001", holder: emp1Id, hName: "Employee Charlie", overdue: false },
    { id: "AL-2", assetId: "A-002", tag: "AF-002", holder: emp2Id, hName: "Employee Dave", overdue: true },
    { id: "AL-3", assetId: "A-003", tag: "AF-003", holder: managerId, hName: "Manager Bob", overdue: false }
  ];
  for (const al of allocs) {
    const data = {
      assetId: al.assetId,
      assetTag: al.tag,
      holderId: al.holder,
      holderType: "Employee",
      holderName: al.hName,
      status: "Active",
      allocatedAt: FieldValue.serverTimestamp(),
    };
    if (al.overdue) {
      data.expectedReturnDate = Timestamp.fromDate(new Date(now.getTime() - 2 * 24*60*60*1000));
      data.isOverdue = true;
    }
    await allocsRef.doc(al.id).set(data);
  }

  // 9. BOOKINGS
  const bookingsRef = db.collection("bookings");
  const todayAt = (hour) => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  
  const bks = [
    { id: "BK-1", assetId: "A-004", name: "AF-004", status: "Upcoming", start: todayAt(14), end: todayAt(15) },
    { id: "BK-2", assetId: "A-005", name: "AF-005", status: "Upcoming", start: todayAt(9), end: todayAt(10) },
    { id: "BK-3", assetId: "A-005", name: "AF-005", status: "Upcoming", start: todayAt(10), end: todayAt(11) }
  ];
  for (const b of bks) {
    await bookingsRef.doc(b.id).set({
      assetId: b.assetId,
      resourceName: b.name,
      bookerUserId: emp1Id,
      bookerName: "Employee Charlie",
      startTime: Timestamp.fromDate(b.start),
      endTime: Timestamp.fromDate(b.end),
      status: b.status,
      createdAt: FieldValue.serverTimestamp()
    });
  }

  // 10. MAINTENANCE REQUESTS
  const maintRef = db.collection("maintenanceRequests");
  const maints = [
    { id: "MR-1", assetId: "A-014", tag: "AF-014", status: "Pending" },
    { id: "MR-2", assetId: "A-010", tag: "AF-010", status: "Approved" },
    { id: "MR-3", assetId: "A-011", tag: "AF-011", status: "TechnicianAssigned" },
    { id: "MR-4", assetId: "A-012", tag: "AF-012", status: "InProgress" },
    { id: "MR-5", assetId: "A-001", tag: "AF-001", status: "Resolved", resolved: true }
  ];
  for (const m of maints) {
    const data = {
      assetId: m.assetId,
      assetTag: m.tag,
      assetName: `Vehicles Item ${m.tag}`,
      requesterUserId: emp2Id,
      requesterName: "Employee Dave",
      status: m.status,
      issueDescription: `Issue for ${m.tag}`,
      createdAt: FieldValue.serverTimestamp()
    };
    if (m.resolved) {
      data.resolvedAt = FieldValue.serverTimestamp();
      data.resolutionNotes = "Fixed the issue.";
    }
    await maintRef.doc(m.id).set(data);
  }

  // 11. AUDIT CYCLES
  const auditsRef = db.collection("auditCycles");
  const auditId = "AUDIT-1";
  await auditsRef.doc(auditId).set({
    scopeType: "Location",
    scopeValue: "Headquarters",
    status: "InProgress",
    startDate: FieldValue.serverTimestamp(),
    actorName: "Admin Alice",
    actorUserId: adminId
  });

  const hqAssets = assets.filter(a => a.loc === "Headquarters");
  for (let i = 0; i < hqAssets.length; i++) {
    let res = "Pending";
    if (i === 0) res = "Verified";
    if (i === 1) res = "Missing";
    
    await auditsRef.doc(auditId).collection("assetChecks").doc(hqAssets[i].id).set({
      assetTag: hqAssets[i].tag,
      result: res,
      verifiedByUserId: adminId,
      checkedAt: FieldValue.serverTimestamp()
    });
  }

  // 12. NOTIFICATIONS
  const notifsRef = db.collection("notifications");
  const timeMinusMins = (m) => new Date(now.getTime() - m * 60 * 1000);
  
  const notifs = [
    { type: "OverdueReturn", cat: "Alert", title: "Overdue Return", msg: "AF-002 is overdue", read: false, time: timeMinusMins(120), user: emp2Id },
    { type: "AuditDiscrepancy", cat: "Alert", title: "Audit Discrepancy", msg: "Missing asset in HQ", read: true, time: timeMinusMins(1440), user: adminId },
    { type: "MaintenanceApproved", cat: "Approval", title: "Maintenance Approved", msg: "Request for AF-010 approved", read: false, time: timeMinusMins(30), user: emp2Id },
    { type: "TransferApproved", cat: "Approval", title: "Transfer Approved", msg: "Transfer for AF-001 approved", read: true, time: timeMinusMins(2880), user: emp1Id },
    { type: "BookingConfirmed", cat: "Booking", title: "Booking Confirmed", msg: "Booking for AF-004 confirmed", read: false, time: timeMinusMins(5), user: emp1Id },
    { type: "BookingConfirmed", cat: "Booking", title: "Booking Confirmed", msg: "Booking for AF-005 confirmed", read: true, time: timeMinusMins(60), user: emp1Id }
  ];
  for (const n of notifs) {
    await notifsRef.add({
      userId: n.user,
      category: n.cat,
      type: n.type,
      title: n.title,
      message: n.msg,
      isRead: n.read,
      createdAt: Timestamp.fromDate(n.time)
    });
  }

  // 13. ACTIVITY LOGS
  const actsRef = db.collection("activityLogs");
  const acts = [
    { action: "ASSET_ALLOCATED", actor: adminId, actorName: "Admin Alice", meta: { assetTag: "AF-001", holderName: "Employee Charlie", departmentName: "Engineering" }, time: timeMinusMins(2000) },
    { action: "MAINTENANCE_APPROVED", actor: managerId, actorName: "Manager Bob", meta: { assetTag: "AF-010" }, time: timeMinusMins(30) },
    { action: "BOOKING_CREATED", actor: emp1Id, actorName: "Employee Charlie", meta: { resourceName: "AF-004", startTime: Timestamp.fromDate(todayAt(14)), endTime: Timestamp.fromDate(todayAt(15)) }, time: timeMinusMins(5) },
    { action: "TRANSFER_APPROVED", actor: managerId, actorName: "Manager Bob", meta: { assetTag: "AF-001", to: "Employee Charlie", departmentName: "Engineering" }, time: timeMinusMins(2880) },
    { action: "ASSET_CREATED", actor: adminId, actorName: "Admin Alice", meta: { assetTag: "AF-014" }, time: timeMinusMins(10000) }
  ];
  for (const a of acts) {
    await actsRef.add({
      actorUserId: a.actor,
      actorName: a.actorName,
      action: a.action,
      targetCollection: "system",
      targetDocId: "sys",
      metadata: a.meta,
      timestamp: Timestamp.fromDate(a.time)
    });
  }

  console.log(`\n✅ Seeding Complete!`);
  console.log(`- 4 Users created`);
  console.log(`- 3 Departments created`);
  console.log(`- 3 Categories created`);
  console.log(`- 14 Assets created`);
  console.log(`- 5 Asset stats updated`);
  console.log(`- 3 Department stats created`);
  console.log(`- 3 Allocations created`);
  console.log(`- 3 Bookings created`);
  console.log(`- 5 Maintenance Requests created`);
  console.log(`- 1 Audit Cycle created (with ${hqAssets.length} checks)`);
  console.log(`- 6 Notifications created`);
  console.log(`- 5 Activity Logs created`);
  
  console.log(`\n--- REFERENCE ARRAYS ---`);
  console.log(`LOCATIONS:`, JSON.stringify(LOCATIONS));
  console.log(`DEPARTMENTS:`, JSON.stringify(DEPARTMENTS));
}

seed().catch(console.error).finally(() => process.exit(0));
