import React, { useState, useEffect } from "react";
import { getAllDepartmentStats } from "../services/departmentStatsService";
import {
  getMostUsedAssets,
  getIdleAssets,
  getAssetsDueForMaintenance,
  getAssetsNearingRetirement,
  getAuditDiscrepancyReports
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
  const [auditReports, setAuditReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const results = await Promise.allSettled([
        getAllDepartmentStats(),
        getMostUsedAssets(),
        getIdleAssets(),
        getAssetsDueForMaintenance(),
        getAssetsNearingRetirement(),
        getAuditDiscrepancyReports()
      ]);

      const safeData = results.map(r => r.status === 'fulfilled' ? r.value : []);

      const [deptStats, used, idleList, maintDue, retireDue, audits] = safeData;

      setDepartmentStats(deptStats);
      setMostUsed(used);
      setIdle(idleList);
      setMaintenanceDue(maintDue);
      setRetirementDue(retireDue);
      setAuditReports(audits);
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
    lines.push("");

    lines.push("--- Audit Discrepancy Reports ---");
    lines.push("Closed At,Scope,Assets Checked,Missing,Damaged");
    auditReports.forEach(a => {
      lines.push(`${a.closedAt ? a.closedAt.toLocaleDateString() : ''},${a.scopeValue} (${a.scopeType}),${a.totalAssetsChecked},${a.missingCount},${a.damagedCount}`);
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

        {/* Audit Discrepancy Reports */}
        <div className="report-card top-row-card">
          <h4 className="report-card-title">Recent Audit Reports</h4>
          <div className="report-card-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', paddingRight: '4px' }}>
            {auditReports.length === 0 ? (
              <EmptyState 
                title="No closed audits yet" 
                subtitle="Run and close an audit cycle to see reports here"
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                }
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {auditReports.map((report, idx) => {
                  const isClean = report.missingCount === 0 && report.damagedCount === 0;
                  return (
                    <div key={report.id || idx} style={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                          Scope: {report.scopeValue}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {report.closedAt ? report.closedAt.toLocaleDateString() : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Checked: {report.totalAssetsChecked}</span>
                        {isClean ? (
                          <span style={{ color: '#10b981', fontWeight: 500 }}>Clean Audit ✓</span>
                        ) : (
                          <span style={{ color: '#f43f5e', fontWeight: 500 }}>
                            {report.missingCount > 0 && `${report.missingCount} missing `}
                            {report.damagedCount > 0 && `${report.damagedCount} damaged`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
