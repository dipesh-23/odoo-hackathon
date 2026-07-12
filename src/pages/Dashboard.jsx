import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import DashboardOverview from "../components/DashboardOverview";
import OrganizationSetup from "./OrganizationSetup";
import ResourceBooking from "./ResourceBooking";
import Maintenance from "./Maintenance";
import Audit from "./Audit";
import Reports from "./Reports";
import Notifications from "./Notifications";
import AssetsDirectory from "./AssetsDirectory";
import AllocationTransfer from "./AllocationTransfer";
import { canManageOrg, canRegisterAsset, canViewReports, canManageAudit } from "../utils/rbac";

// Maps each role to its home/default page
function getDefaultPage(role) {
  if (role === "Admin")         return "org-setup";
  if (role === "AssetManager")  return "assets";
  return "allocation"; // DepartmentHead + Employee land on Allocation
}

// Pages each role is allowed to visit (belt-and-suspenders on top of sidebar)
function isPageAllowed(page, role) {
  if (page === "org-setup")        return canManageOrg(role);
  if (page === "audit")            return canManageAudit(role);
  if (page === "reports")          return canViewReports(role);
  // assets, allocation, resource-booking, maintenance, notifications → all roles
  return true;
}

const PAGE_LABELS = {
  "org-setup":        "Organization Setup",
  "assets":           "Assets",
  "allocation":       "Allocation & Transfer",
  "resource-booking": "Resource Booking",
  "maintenance":      "Maintenance",
  "audit":            "Audit",
  "reports":          "Reports",
  "notifications":    "Notifications",
};

export default function Dashboard({ onLogout }) {
  const { currentUser, userProfile, logout } = useAuth();
  const currentRole = userProfile?.role || "Employee";

  const defaultPage = getDefaultPage(currentRole);
  const [activePage, setActivePage] = useState(defaultPage);

  // Guard: if someone tries to navigate to a forbidden page, bounce them back
  function handleNavigate(page) {
    if (isPageAllowed(page, currentRole)) setActivePage(page);
  }

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <div className="app-shell">
      <div className="app-window">
        {/* Sidebar */}
        <Sidebar activePage={activePage} onNavigate={handleNavigate} />

        {/* Main Content */}
        <main className="main-content">
          {/* Top Bar */}
          <header className="top-bar">
            <div className="top-bar-left">
              <h2 className="top-bar-page-title">{PAGE_LABELS[activePage] || ""}</h2>
            </div>
            <div className="top-bar-right">
              <div className="top-bar-user">
                <div className="top-bar-avatar">
                  {currentUser?.email?.charAt(0).toUpperCase() || "U"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {userProfile?.name || currentUser?.email}
                  </span>
                  <span className="top-bar-email" style={{ fontSize: 11 }}>
                    {currentRole.replace("AssetManager", "Asset Manager").replace("DepartmentHead", "Dept. Head")}
                  </span>
                </div>
              </div>
              <button id="topbar-logout-btn" className="top-bar-logout" onClick={handleLogout}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign Out
              </button>
            </div>
          </header>

          {/* Page Content */}
          <div className="page-content">
            {activePage === "dashboard" && <DashboardOverview onNavigate={setActivePage} />}
            {activePage === "org-setup" && <OrganizationSetup />}
            {activePage === "resource-booking" && <ResourceBooking />}
            {activePage === "maintenance" && <Maintenance />}
            {activePage === "audit" && <Audit />}
            {activePage === "reports" && <Reports />}
            {activePage === "notifications" && <Notifications />}
            {activePage === "assets" && <AssetsDirectory />}
            {activePage === "allocation" && <AllocationTransfer />}
            {/* {activePage !== "dashboard" && activePage !== "org-setup" && activePage !== "resource-booking" && activePage !== "assets" && activePage !== "maintenance" && activePage !== "audit" && activePage !== "reports" && activePage !== "notifications" && (
              <div className="coming-soon-card">
                <div className="coming-soon-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <h2>Coming Soon</h2>
                <p>This section is under development. Check back soon!</p>
              </div>
            )} */}
          </div>
        </main>
      </div>
    </div>
  );
}
