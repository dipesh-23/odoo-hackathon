# AssetFlow — Firebase (Firestore) Schema

NoSQL document-store design. Firestore has no joins/foreign keys, so relationships are modeled via **reference fields** (storing the related doc's ID) and selective **denormalization** (copying a few display fields to avoid extra reads on list views).

Naming convention: collections are plural, camelCase; documents use auto-generated IDs unless noted.

---

## 1. `users`
One doc per authenticated account (mirrors Firebase Auth UID as doc ID).

```
users/{uid}
├── name: string
├── email: string
├── departmentId: string (ref -> departments)
├── departmentName: string        // denormalized, for list views
├── role: string                  // "Employee" | "DepartmentHead" | "AssetManager" | "Admin"
├── status: string                // "Active" | "Inactive"
├── createdAt: timestamp
├── updatedAt: timestamp
```

**Rules of note**
- On signup, the client always writes `role = "Employee"`. This is enforced (not just assumed) by a Security Rule: `allow create: if request.resource.data.role == "Employee"` — a tampered client write with any other role value is rejected by Firestore itself, no backend function needed.
- Role changes (`Employee → DepartmentHead/AssetManager`) happen via a direct client write from the Admin's Organization Setup screen, gated by a Security Rule requiring the *requester's own* `users/{uid}.role == "Admin"` (checked via a `get()` lookup inside the rule) AND that only the `role` field is being changed on the target doc.

---

## 2. `departments`
```
departments/{departmentId}
├── name: string
├── code: string                  // unique
├── headUserId: string (ref -> users)
├── headName: string               // denormalized
├── parentDepartmentId: string | null   // self-reference for hierarchy
├── employeeCount: number          // incremented/decremented by the client action that adds/removes/moves an employee (FieldValue.increment), same call that writes the users doc
├── status: string                 // "Active" | "Inactive"
├── createdAt: timestamp
```

---

## 3. `categories`
```
categories/{categoryId}
├── name: string                   // e.g. "Electronics", "Furniture"
├── customFields: map              // e.g. { warrantyPeriodMonths: 12 }
├── status: string                 // "Active" | "Inactive"
├── createdAt: timestamp
```

---

## 4. `assets`
```
assets/{assetId}
├── assetTag: string               // unique, auto-generated e.g. "AF-0001"
├── name: string
├── categoryId: string (ref -> categories)
├── categoryName: string           // denormalized
├── serialNumber: string
├── acquisitionDate: timestamp
├── acquisitionCost: number
├── condition: string              // "New" | "Good" | "Fair" | "Poor" | "Damaged"
├── location: string
├── photoUrl: string | null        // Firebase Storage path
├── documentUrls: array<string>
├── isBookable: boolean
├── status: string                 // "Available" | "Allocated" | "Reserved" | "UnderMaintenance" | "Lost" | "Retired" | "Disposed"
├── currentHolderId: string | null  (ref -> users)      // null if unallocated
├── currentHolderName: string | null                     // denormalized
├── currentHolderType: string | null    // "Employee" | "Department"
├── qrCodeUrl: string | null
├── nextServiceDueDate: timestamp | null      // powers "due for maintenance" report
├── retirementThresholdYears: number | null   // powers "nearing retirement" report; falls back to category default if null
├── createdAt: timestamp
├── updatedAt: timestamp
```

**Index needed:** composite index on `(status, categoryId, location)` for the filtered search screen.

### Subcollection: `assets/{assetId}/history`
Append-only combined allocation + maintenance log (read-heavy, per-asset detail view).
```
assets/{assetId}/history/{eventId}
├── type: string            // "Allocation" | "Return" | "Transfer" | "MaintenanceStart" | "MaintenanceEnd" | "AuditFlag"
├── refId: string           // id of the allocation/maintenance/audit doc that triggered this
├── description: string
├── actorUserId: string
├── timestamp: timestamp
```

### Subcollection: `assets/{assetId}/stats`
Pre-aggregated usage data — single doc, updated incrementally by the same client call that performs the underlying action (no background function watching for changes). Backs the "Most used assets," "Idle assets," and "Utilization by department" panels on the Reports screen, which would otherwise require expensive full-collection scans.
```
assets/{assetId}/stats/summary
├── bookingCount30d: number          // client increments in the same transaction as createBooking; a 30-day reset is done lazily — see note below
├── tripCount30d: number              // for vehicle-type assets, if trip/usage logging applies
├── maintenanceCount: number          // client increments in the same call that resolves a maintenanceRequest
├── lastUsedAt: timestamp | null      // client sets this on booking start / allocation / trip completion
├── updatedAt: timestamp
```
**No scheduled rollover without Cloud Functions:** without a nightly job, `bookingCount30d` can't reset itself automatically. Simplest workaround for a hackathon: don't try to bound it to a rolling 30 days — just track `bookingCountTotal` and `lastUsedAt`, and compute "idle" as `lastUsedAt < now - 60 days` at read time in the UI instead of storing a pre-filtered flag.

**Index needed:** collection-group index on `stats` ordered by `lastUsedAt asc` (idle assets) and `bookingCountTotal desc` (most used).

**Department-level rollup** (for "Utilization by department" bar chart) is a separate, smaller aggregate rather than summed client-side from every asset on each page load:
```
departmentStats/{departmentId}
├── departmentName: string            // denormalized
├── assetsAllocated: number
├── utilizationScore: number          // e.g. allocated / total assets in dept; client recomputes and writes this after any allocation/return in that department
├── updatedAt: timestamp
```

---

## 5. `allocations`
One doc per allocation lifecycle (not per asset — a new doc is created each time an asset is allocated, so history is naturally preserved across the top-level collection too).
```
allocations/{allocationId}
├── assetId: string (ref -> assets)
├── assetTag: string               // denormalized
├── holderId: string (ref -> users or departments)
├── holderType: string             // "Employee" | "Department"
├── holderName: string             // denormalized
├── allocatedByUserId: string
├── allocatedAt: timestamp
├── expectedReturnDate: timestamp | null
├── actualReturnDate: timestamp | null
├── returnConditionNotes: string | null
├── status: string                 // "Active" | "Returned" | "TransferRequested" | "TransferApproved"
```
Note: `isOverdue` is **not** stored as a field — it's computed on read from `expectedReturnDate` (`isOverdue = status === "Active" && expectedReturnDate < now`), since there's no scheduled job available to keep a stored flag fresh without Cloud Functions.

### Subcollection: `allocations/{allocationId}/transferRequests`
```
allocations/{allocationId}/transferRequests/{requestId}
├── requestedByUserId: string
├── requestedForUserId: string      // new intended holder
├── reason: string
├── status: string                  // "Requested" | "Approved" | "Rejected"
├── approvedByUserId: string | null
├── requestedAt: timestamp
├── resolvedAt: timestamp | null
```

**Conflict rule enforcement (client-side, no Cloud Functions):** implemented as a two-phase check in the client's `allocateAsset` function — (1) query `allocations` for an existing doc with the same `assetId` and `status == "Active"` *before* the transaction, and (2) inside a Firestore `runTransaction`, re-read `assets/{assetId}.status` and abort if it's not `"Available"`. Phase 2 is what actually closes the race window, since the web SDK's transactions can only re-verify specific document reads, not queries. If either check fails, the write is rejected and the client shows "currently held by X" + prompts a `transferRequests` doc instead.

**Dashboard "Pending Transfers" KPI:** since `transferRequests` is nested under each `allocations` doc, counting pending transfers across the whole org requires a **collection-group query** on `transferRequests` where `status == "Requested"` — not a query on the top-level `allocations` collection. This needs its own collection-group index (`status`), separate from the per-allocation subcollection index.

---

## 6. `resources` (bookable subset of assets — can also just reuse `assets` where `isBookable == true`)
Kept separate only if bookable resources need fields assets don't (e.g. capacity). Otherwise skip this collection and query `assets` directly.
```
resources/{resourceId}
├── assetId: string (ref -> assets)   // 1:1 link if kept separate
├── name: string
├── capacity: number | null
```

## 7. `bookings`
```
bookings/{bookingId}
├── resourceId: string (ref -> assets, where isBookable = true)
├── resourceName: string            // denormalized
├── bookedByUserId: string
├── bookedByName: string            // denormalized
├── departmentId: string | null
├── startTime: timestamp
├── endTime: timestamp
├── purpose: string
├── status: string                  // "Upcoming" | "Ongoing" | "Completed" | "Cancelled"
├── createdAt: timestamp
```

**Index needed:** composite index on `(resourceId, startTime, endTime)` — overlap check queries all bookings for a resource where `startTime < newEnd AND endTime > newStart`. Firestore can't do this range-on-two-fields check natively in one query, so implement as: query all bookings for `resourceId` with `startTime < newEnd`, then filter client-side for `endTime > newStart`.

**Client-side enforcement (no Cloud Functions):** the overlap check and the booking write happen in the client's `createBooking` function — query for conflicts first, then wrap the actual `bookings` doc creation in a `runTransaction` as a best-effort race-condition guard. Note this is genuinely weaker than a server-side check: two users tapping "Book" within the same instant could both pass the pre-check before either write lands. Acceptable risk for a hackathon demo; call this out explicitly if asked about production-readiness.

---

## 8. `maintenanceRequests`
```
maintenanceRequests/{requestId}
├── assetId: string (ref -> assets)
├── assetTag: string                // denormalized
├── raisedByUserId: string
├── issueDescription: string
├── priority: string                 // "Low" | "Medium" | "High"
├── photoUrl: string | null
├── status: string                   // "Pending" | "Approved" | "Rejected" | "TechnicianAssigned" | "InProgress" | "Resolved"
├── approvedByUserId: string | null
├── technicianName: string | null
├── raisedAt: timestamp
├── resolvedAt: timestamp | null
├── resolutionNotes: string | null
```

**Two-way status sync (client-side, no Cloud Functions):** the client's `updateMaintenanceStatus` function updates the `maintenanceRequests` doc and the linked `assets/{assetId}.status` field **together, inside one `runTransaction`**, so they can't drift out of sync even if the app crashes mid-update:
- `status` transitions to `"Approved"` → set `assets/{assetId}.status = "UnderMaintenance"`
- `status` transitions to `"Resolved"` → set `assets/{assetId}.status = "Available"` (unless asset is separately marked Retired)

Doing these two writes in a transaction (rather than two separate `.update()` calls) is the important part — without Cloud Functions there's no automatic retry/rollback, so an interrupted two-step write could leave an asset stuck in the wrong status.

---

## 9. `auditCycles`
```
auditCycles/{auditCycleId}
├── scopeType: string                // "Department" | "Location"
├── scopeValue: string                // departmentId or location string
├── startDate: timestamp
├── endDate: timestamp
├── auditorUserIds: array<string>
├── status: string                    // "Planned" | "InProgress" | "Closed"
├── createdAt: timestamp
├── closedAt: timestamp | null
```

### Subcollection: `auditCycles/{auditCycleId}/assetChecks`
```
auditCycles/{auditCycleId}/assetChecks/{assetId}     // doc ID = assetId for easy upsert
├── assetTag: string                  // denormalized
├── verifiedByUserId: string | null
├── result: string                    // "Pending" | "Verified" | "Missing" | "Damaged"
├── notes: string | null
├── checkedAt: timestamp | null
```

**On close (`status → "Closed"`) — client-side, no Cloud Functions:** this is the single largest chunk of logic that has to move to the client without a backend function, so it's the riskiest one to get right. The client's `closeAuditCycle` function:
1. Reads all docs in `assetChecks` for the cycle
2. Builds a Firestore `writeBatch` (not a transaction — batches allow up to 500 writes across many documents, which a transaction doesn't scale to as cleanly) that, for every doc with `result == "Missing"`, sets `assets/{assetId}.status = "Lost"`
3. Adds the `auditCycles/{id}.status = "Closed"` update and the `discrepancyReport/summary` doc (below) to the same batch
4. Commits the batch once — either all writes succeed or none do

This is inherently less safe than a server-side function (a user could close their browser mid-process before calling `commit()`, though the batch itself is atomic once submitted). For an 8-hour build, this is an acceptable trade — just make sure the "Close Audit Cycle" button disables itself and shows a loading state until the batch commit resolves, so nobody double-clicks it.

### Subcollection: `auditCycles/{auditCycleId}/discrepancyReport`
Single summary doc, auto-generated on close.
```
auditCycles/{auditCycleId}/discrepancyReport/summary
├── totalAssetsChecked: number
├── missingCount: number
├── damagedCount: number
├── flaggedAssetIds: array<string>
├── generatedAt: timestamp
```

---

## 10. `notifications`
```
notifications/{notificationId}
├── userId: string (ref -> users)      // recipient
├── type: string        // "AssetAssigned" | "MaintenanceApproved" | "MaintenanceRejected" | "BookingConfirmed" | "BookingCancelled" | "BookingReminder" | "TransferApproved" | "OverdueReturn" | "AuditDiscrepancy"
├── category: string    // "Alert" | "Approval" | "Booking"  — powers the All/Alerts/Approvals/Bookings tab filter directly, avoiding a per-tab array of `type` values
├── title: string
├── message: string
├── relatedRefId: string | null        // id of the source doc (allocation, booking, etc.)
├── isRead: boolean
├── createdAt: timestamp
```

**Client-side generation (no Cloud Functions):** since there's no background trigger listening for state changes, whichever client function performs the underlying action (`allocateAsset`, `updateMaintenanceStatus`, `createBooking`, etc.) must also write the `notifications` doc itself, ideally in the same transaction/batch as the primary write. Missing this in any one function means that action silently produces no notification — worth a quick checklist pass across all action functions before the demo.

**`type` → `category` mapping** (set by the client function that creates the notification):
| type | category |
|---|---|
| OverdueReturn, AuditDiscrepancy | Alert |
| MaintenanceApproved, MaintenanceRejected, TransferApproved | Approval |
| BookingConfirmed, BookingCancelled, BookingReminder | Booking |
| AssetAssigned | Alert |

**Index needed:** composite index on `(userId, isRead, createdAt desc)` for the notification bell/list, and `(userId, category, createdAt desc)` for the tab filters.

---

## 11. `activityLogs`
Append-only. **Without Cloud Functions, there's no automatic trigger writing these** — each client action function (allocation, transfer, booking, maintenance update, audit close, etc.) must explicitly add an `activityLogs` write to its own transaction/batch. This is the second place (after notifications) where skipping the extra write in any one function means that action just silently doesn't appear in the log — worth the same pre-demo checklist pass.
```
activityLogs/{logId}
├── actorUserId: string
├── actorName: string                  // denormalized
├── action: string                      // e.g. "ASSET_ALLOCATED", "MAINTENANCE_APPROVED"
├── targetCollection: string
├── targetDocId: string
├── metadata: map                       // free-form details of what changed
├── timestamp: timestamp
```

**Index needed:** composite index on `(targetCollection, targetDocId, timestamp desc)` for per-record audit trails.

---

## Client-side function responsibility map (no Cloud Functions)

This project intentionally has **no Cloud Functions** — the Blaze billing plan they require wasn't wanted for an 8-hour hackathon build. Every piece of logic that would normally live in a backend function instead lives in a client-side JS module (e.g. `src/services/*.js`), using `runTransaction` or `writeBatch` from the Firestore Web SDK to keep related writes atomic. Security Rules are the backstop for anything the client can't be fully trusted to enforce on its own.

| Client function | Where it runs | Replaces (former Cloud Function) | How atomicity is kept |
|---|---|---|---|
| Signup flow | On account creation | `onUserCreate` | Security Rule rejects any `role` other than `"Employee"` at write time — not a function, a rule |
| `promoteUser(uid, newRole)` | Admin's Organization Setup screen | `promoteUser` | Single doc update, gated by Security Rule checking caller's own role via `get()` |
| `allocateAsset(...)` | Allocation & Transfer screen | `allocateAsset` | Pre-check query + `runTransaction` re-verifying `assets.status` |
| `requestTransfer(...)` / `approveTransfer(...)` | Same screen | `requestTransfer` / `approveTransfer` | `runTransaction` closing old allocation + opening new one together |
| `createBooking(...)` | Resource Booking screen | `createBooking` | Pre-check query + `runTransaction` on the booking write (weaker guarantee — see note in `bookings` section) |
| `updateMaintenanceStatus(...)` | Maintenance kanban | `updateMaintenanceStatus` | `runTransaction` updating request + asset status together |
| `closeAuditCycle(...)` | Audit screen | `closeAuditCycle` | `writeBatch` across all `assetChecks` + cycle doc + discrepancy report |
| Overdue return / booking / maintenance flags | Computed at render time in Dashboard/Reports components | `checkOverdueReturns`, `checkOverdueBookingsAndMaintenance` | Not stored — computed live from `expectedReturnDate`/`endTime` vs `now()` on each read |
| Activity log write | Appended by every action function above, in the same transaction/batch | `logActivity` | Bundled into the same atomic write as the primary action |
| Notification write | Appended by every action function above, in the same transaction/batch where possible | (implicit, was part of each function) | Bundled where possible; a few notification types (e.g. booking reminders before a slot starts) have no client-side equivalent to a scheduled job and are simply out of scope without Cloud Functions |

**Known gap:** booking reminder notifications ("reminder before a slot starts") genuinely required a scheduled job in the original design. Without Cloud Functions there's no clean replacement — cut this from the hackathon scope, or approximate it by checking on every app load whether any of the user's upcoming bookings start within the next N minutes and surfacing an in-app banner (not a push/email reminder).

---

## Firestore Security Rules — key principles

With no Cloud Functions, Security Rules carry more of the enforcement burden than they would in the original design. Key rules to actually write (not just document):

- **Role protection:** `users/{uid}` creates must have `role == "Employee"`; updates must not change `role` unless the requester's own `users/{request.auth.uid}.role == "Admin"` (checked via a `get()` lookup inside the rule).
- **Status field guarding:** `assets.status`, `allocations.status`, `maintenanceRequests.status` should only accept values from their valid enum on write — rules can enforce the *shape* of a valid transition (e.g. "resolves to one of these 7 strings") but **cannot** enforce the full business logic (e.g. "can't skip from Pending straight to Resolved") the way a Cloud Function could. That gap is covered by the client-side functions in the responsibility map above, which is weaker than rules-level enforcement — a technically determined user could bypass the client and write an invalid transition directly. Flag this as a known limitation if asked about production-readiness.
- **Role-gated approvals:** actions like "only Asset Manager can approve maintenance" are enforced with a `get()` lookup on the requester's `users/{request.auth.uid}` doc inside the relevant rule — this costs an extra read per rule evaluation but is the only way to check caller identity without a Cloud Function.
- Reads are scoped by role: Employees can read their own `allocations`/`bookings`/`notifications`; Department Heads can read their department's docs (`where departmentId == request.auth.token.departmentId`); Admin/Asset Manager have broader read access.

Deploy with `firebase deploy --only firestore:rules` — no Blaze plan required, since Security Rules are free on Spark.

---

## Why this shape (design notes)
- **Denormalization** (e.g. `assetTag`, `holderName` copied onto related docs) avoids N+1 reads on list/dashboard screens — a core Firestore cost/performance concern that doesn't exist in SQL.
- **New doc per allocation** (rather than mutating one asset-embedded field) gives free historical audit trail without extra collections.
- **Audit checks as a subcollection keyed by assetId** allows upsert-style writes (auditor re-checks an asset → same doc updates) instead of needing a query to find "does a check already exist for this asset in this cycle."

## Why no Cloud Functions (and what it costs)
This project runs entirely on the **free Spark plan** — no billing account required. That's the whole reason for this choice: Cloud Functions requires the Blaze plan even though actual usage would stay within the free tier.

The trade-off is real and worth stating plainly for a judge Q&A:
- Business logic that was atomic and server-trusted (conflict checks, overlap checks, status sync, audit closing) now runs in the browser via Firestore transactions/batches — weaker against a determined user bypassing the UI, though fine for a demo judged through the actual app.
- Two features have no clean client-side equivalent and are explicitly out of scope: scheduled overdue-flagging (replaced with compute-on-read) and booking reminder notifications (replaced with an on-load banner check, or cut entirely).
- Every action function must remember to write its own `activityLogs` and `notifications` entries, since there's no background trigger catching writes it might miss.

If asked "how would you productionize this," the honest answer is: move the transaction logic identified in the responsibility map back into Cloud Functions (or Firebase SQL Connect, if the data model were to move to PostgreSQL) once billing is no longer a constraint — the collection/field structure in this document doesn't need to change to make that move.
