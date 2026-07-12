// ─── Role-Based Access Control (RBAC) ────────────────────────────────────────
// Hierarchy: Admin > AssetManager > DepartmentHead > Employee
// One place to update all permission logic for the entire app.

export const ROLES = {
  ADMIN:        "Admin",
  ASSET_MANAGER:"AssetManager",
  DEPT_HEAD:    "DepartmentHead",
  EMPLOYEE:     "Employee",
};

/** Returns true if `role` is one of the allowed roles. */
const has = (role, ...allowed) => allowed.includes(role);

// ─── Asset Registration & Management ─────────────────────────────────────────
/** Admin + AssetManager can register new assets. */
export const canRegisterAsset = (role) => has(role, "Admin", "AssetManager");
/** Admin + AssetManager can edit asset details. */
export const canEditAsset     = (role) => has(role, "Admin", "AssetManager");
/** Only Admin can permanently delete assets. */
export const canDeleteAsset   = (role) => has(role, "Admin");

// ─── Allocation ───────────────────────────────────────────────────────────────
/** Admin + AssetManager can directly allocate assets to employees/departments. */
export const canDirectlyAllocate = (role) => has(role, "Admin", "AssetManager");
/** All roles can initiate a transfer request (scoped by what they see). */
export const canRequestTransfer  = (_role) => true;
/** Admin + AssetManager + DepartmentHead can approve/reject transfers. */
export const canApproveTransfer  = (role) => has(role, "Admin", "AssetManager", "DepartmentHead");
/** Admin + AssetManager can mark assets as returned. */
export const canReturnAsset      = (role) => has(role, "Admin", "AssetManager");

// ─── Organization Setup ───────────────────────────────────────────────────────
/** Only Admin manages departments, categories, employees & roles. */
export const canManageOrg = (role) => has(role, "Admin");

// ─── Maintenance ──────────────────────────────────────────────────────────────
/** All roles can raise a maintenance request. */
export const canRaiseMaintenance   = (_role) => true;
/** Admin + AssetManager approve/resolve maintenance. */
export const canApproveMaintenance = (role) => has(role, "Admin", "AssetManager");

// ─── Analytics / Audit / Reports ─────────────────────────────────────────────
export const canViewReports = (role) => has(role, "Admin", "AssetManager");
export const canManageAudit = (role) => has(role, "Admin", "AssetManager");

// ─── Scoped data access ───────────────────────────────────────────────────────
/**
 * Filter allocations the given role should be able to see.
 * - Admin / AssetManager / DepartmentHead: all allocations
 * - Employee: their own allocations + all in their department
 */
export function scopeAllocations(allocations, role, userId, departmentId) {
  if (has(role, "Admin", "AssetManager", "DepartmentHead")) return allocations;
  // Employee: own assets + department assets (so they can request transfers for dept assets too)
  return allocations.filter(
    (a) => a.holderId === userId || (departmentId && a.departmentId === departmentId)
  );
}
