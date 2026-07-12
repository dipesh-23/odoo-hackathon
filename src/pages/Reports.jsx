import React, { useState, useEffect } from "react";
import { getAllDepartmentStats } from "../services/departmentStatsService";
import {
  getMostUsedAssets,
  getIdleAssets,
  getAssetsDueForMaintenance,
  getAssetsNearingRetirement
} from "../services/reportService";

const EmptyState = ({ title, subtitle, icon }) => (
  <div className="report-empty-state">
    <div className="report-empty-icon">{icon}</div>
    <div className="report-empty-title">{title}</div>
    <div className="report-empty-subtitle">{subtitle}</div>
  </div>
);

export default function Reports() {
  const [departmentStats, setDepartmentStats] = useState([]);
  const [mostUsed, setMostUsed] = useState([]);
  const [idle, setIdle] = useState([]);
  const [maintenanceDue, setMaintenanceDue] = useState([]);
  const [retirementDue, setRetirementDue] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [deptStats, used, idleList, maintDue, retireDue] = await Promise.all([
        getAllDepartmentStats(),
        getMostUsedAssets(),
        getIdleAssets(),
        getAssetsDueForMaintenance(),
        getAssetsNearingRetirement()
      ]);

      setDepartmentStats(deptStats);
      setMostUsed(used);
      setIdle(idleList);
      setMaintenanceDue(maintDue);
      setRetirementDue(retireDue);
    } catch (err) {
      console.error("Error loading reports data:", err);
      // Failsafe if index doesn't exist yet
      if (err.message && err.message.includes("index")) {
        alert("Firestore index missing. Deployment of firestore.indexes.json is required.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    const lines = [];
    lines.push("AssetFlow Report - " + new Date().toISOString());
    lines.push("");

    lines.push("--- Utilization by Department ---");
    lines.push("Department,Utilization Score,Assets Allocated");
    departmentStats.forEach(d => {
      lines.push(`${d.departmentName},${d.utilizationScore},${d.assetsAllocated}`);
    });
    lines.push("");

    lines.push("--- Most Used Assets ---");
    lines.push("Asset Name,Bookings (30d)");
    mostUsed.forEach(a => {
      lines.push(`${a.name},${a.bookingCount30d}`);
    });
    lines.push("");

    lines.push("--- Idle Assets ---");
    lines.push("Asset Name,Last Used At");
    idle.forEach(a => {
      lines.push(`${a.name},${a.lastUsedAt ? new Date(a.lastUsedAt.toDate ? a.lastUsedAt.toDate() : a.lastUsedAt).toLocaleDateString() : 'Never'}`);
    });
    lines.push("");

    lines.push("--- Action Required ---");
    maintenanceDue.forEach(a => {
      lines.push(`MAINTENANCE DUE: ${a.name || a.tag} - Service due soon`);
    });
    retirementDue.forEach(a => {
      lines.push(`RETIREMENT: ${a.name || a.tag} - Nearing retirement threshold`);
    });

    const csvContent = lines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "AssetFlow_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return <div className="reports-container"><div className="loading-state">Loading reports...</div></div>;
  }

  return (
    <div className="reports-container">
      <div className="reports-header">
        <h3 className="section-title">Reports & Analytics</h3>
        <p className="reports-subtitle">Read-only analytics backed by pre-aggregated data.</p>
      </div>

      {/* Top Charts Row */}
      <div className="reports-charts-grid">
        {/* Utilization by Department (CSS Bar Chart) */}
        <div className="report-card top-row-card">
          <h4 className="report-card-title">Utilization by department</h4>
          <div className="report-card-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {departmentStats.length === 0 ? (
              <EmptyState 
                title="No department stats yet" 
                subtitle="Data appears once bookings are logged"
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="10" width="4" height="10" rx="1"/><rect x="10" y="4" width="4" height="16" rx="1"/><rect x="16" y="14" width="4" height="6" rx="1"/>
                  </svg>
                }
              />
            ) : (
              <div className="css-bar-chart">
                {departmentStats.map(dept => {
                  const pct = Math.min(100, Math.max(0, (dept.utilizationScore || 0) * 100));
                  return (
                    <div className="bar-row" key={dept.id}>
                      <div className="bar-label">{dept.departmentName}</div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${pct}%` }}></div>
                      </div>
                      <div className="bar-value">{pct.toFixed(0)}%</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Maintenance Frequency (Static Illustrative Line Chart) */}
        <div className="report-card top-row-card">
          <h4 className="report-card-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            Maintenance frequency
            <span className="demo-badge">Demo data</span>
          </h4>
          <div className="report-card-content">
            <div className="svg-line-chart">
              <svg viewBox="0 0 400 180" width="100%" height="180">
                {/* Gridlines */}
                <line x1="30" y1="20" x2="380" y2="20" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="30" y1="70" x2="380" y2="70" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="30" y1="120" x2="380" y2="120" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
                
                {/* Y-axis labels */}
                <text x="20" y="24" fill="var(--text-muted)" fontSize="11" textAnchor="end">12</text>
                <text x="20" y="74" fill="var(--text-muted)" fontSize="11" textAnchor="end">6</text>
                <text x="20" y="124" fill="var(--text-muted)" fontSize="11" textAnchor="end">0</text>
                
                {/* Y-axis line */}
                <line x1="30" y1="10" x2="30" y2="130" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                {/* X-axis line */}
                <line x1="30" y1="120" x2="380" y2="120" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                
                {/* Line */}
                <polyline fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" points="60,105 130,90 200,75 270,45 340,15" />
                
                {/* Dots */}
                <circle cx="60" cy="105" r="3.5" fill="#f59e0b" />
                <circle cx="130" cy="90" r="3.5" fill="#f59e0b" />
                <circle cx="200" cy="75" r="3.5" fill="#f59e0b" />
                <circle cx="270" cy="45" r="3.5" fill="#f59e0b" />
                <circle cx="340" cy="15" r="3.5" fill="#f59e0b" />

                {/* X-axis labels */}
                <text x="60" y="145" fill="var(--text-muted)" fontSize="11" textAnchor="middle">Jan</text>
                <text x="130" y="145" fill="var(--text-muted)" fontSize="11" textAnchor="middle">Feb</text>
                <text x="200" y="145" fill="var(--text-muted)" fontSize="11" textAnchor="middle">Mar</text>
                <text x="270" y="145" fill="var(--text-muted)" fontSize="11" textAnchor="middle">Apr</text>
                <text x="340" y="145" fill="var(--text-muted)" fontSize="11" textAnchor="middle">May</text>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Text Panels Row */}
      <div className="reports-panels-grid">
        <div className="report-card">
          <h4 className="report-card-title">Most used assets</h4>
          <div className="report-card-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {mostUsed.length === 0 ? (
              <EmptyState 
                title="No bookings logged yet" 
                subtitle="Data appears once bookings are logged"
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                }
              />
            ) : (
              <ul className="text-panel-list">
                {mostUsed.map((asset, i) => (
                  <li key={i}>
                    <strong>{asset.name}</strong>: {asset.bookingCount30d} bookings this month.
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="report-card">
          <h4 className="report-card-title">Idle assets</h4>
          <div className="report-card-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {idle.length === 0 ? (
              <EmptyState 
                title="No usage data yet" 
                subtitle="Data appears once bookings are logged"
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                }
              />
            ) : (
              <ul className="text-panel-list">
                {idle.map((asset, i) => {
                  let daysIdle = "Unknown";
                  if (asset.lastUsedAt) {
                    const lastDate = asset.lastUsedAt.toDate ? asset.lastUsedAt.toDate() : new Date(asset.lastUsedAt);
                    const diffTime = Math.abs(new Date() - lastDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    daysIdle = `${diffDays} days`;
                  } else {
                    daysIdle = "Never used";
                  }
                  
                  return (
                    <li key={i}>
                      <strong>{asset.name}</strong>: idle for {daysIdle}.
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Action Section */}
      <div className="report-card full-width">
        <h4 className="report-card-title">Assets due for maintenance / nearing retirement</h4>
        <div className="report-card-content">
          {(maintenanceDue.length === 0 && retirementDue.length === 0) ? (
            <div className="empty-state">No assets currently require attention.</div>
          ) : (
            <ul className="text-panel-list">
              {maintenanceDue.map(asset => {
                const dateStr = asset.nextServiceDueDate?.toDate 
                  ? asset.nextServiceDueDate.toDate().toLocaleDateString()
                  : "soon";
                return (
                  <li key={`maint-${asset.id}`}>
                    <span className="warning-dot"></span>
                    <strong>{asset.name || asset.tag}</strong>: service due by {dateStr}.
                  </li>
                );
              })}
              {retirementDue.map(asset => (
                <li key={`retire-${asset.id}`}>
                  <span className="danger-dot"></span>
                  <strong>{asset.name || asset.tag}</strong>: nearing retirement threshold.
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="reports-footer">
        <button className="btn-secondary export-btn" onClick={handleExport}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Export report
        </button>
      </div>
    </div>
  );
}
