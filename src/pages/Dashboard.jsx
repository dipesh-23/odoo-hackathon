import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import OrganizationSetup from "./OrganizationSetup";
import ResourceBooking from "./ResourceBooking";

export default function Dashboard({ onLogout }) {
  const { currentUser, logout } = useAuth();
  const [activePage, setActivePage] = useState("org-setup");

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <div className="app-shell">
      <div className="app-window">
        {/* Sidebar */}
        <Sidebar activePage={activePage} onNavigate={setActivePage} />

        {/* Main Content */}
        <main className="main-content">
          {/* Top Bar */}
          <header className="top-bar">
            <div className="top-bar-left">
              <h2 className="top-bar-page-title">
                {activePage === "org-setup" ? "Organization Setup" :
                  activePage === "dashboard" ? "Dashboard" :
                    activePage === "assets" ? "Assets" :
                      activePage === "allocation" ? "Allocation & Transfer" :
                        activePage === "resource-booking" ? "Resource Booking" :
                          activePage === "maintenance" ? "Maintenance" :
                            activePage === "audit" ? "Audit" :
                              activePage === "reports" ? "Reports" :
                                activePage === "notifications" ? "Notifications" : ""}
              </h2>
            </div>
            <div className="top-bar-right">
              <div className="top-bar-user">
                <div className="top-bar-avatar">
                  {currentUser?.email?.charAt(0).toUpperCase() || "U"}
                </div>
                <span className="top-bar-email">{currentUser?.email}</span>
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
            {activePage === "org-setup" && <OrganizationSetup />}
            {activePage === "resource-booking" && <ResourceBooking />}
            {activePage !== "org-setup" && activePage !== "resource-booking" && (
              <div className="coming-soon-card">
                <div className="coming-soon-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <h2>Coming Soon</h2>
                <p>This section is under development. Check back soon!</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
