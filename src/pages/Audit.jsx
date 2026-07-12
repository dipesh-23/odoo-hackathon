import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { listAuditCycles, addAssetCheck, closeAuditCycle, getDiscrepancyReport, createAuditCycle } from "../services/auditService";
import { getUserProfile, getActiveEmployees } from "../services/userService";
import { listDepartments } from "../services/departmentService";

export default function Audit() {
  const { currentUser } = useAuth();
  
  const [cycle, setCycle] = useState(null);
  const [auditorNames, setAuditorNames] = useState("");
  const [expectedAssets, setExpectedAssets] = useState([]);
  const [checks, setChecks] = useState({});
  const [discrepancyReport, setDiscrepancyReport] = useState(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    scopeType: "Department",
    scopeValue: "",
    startDate: "",
    endDate: "",
    auditorUserIds: []
  });
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    loadActiveCycle();
    loadOptions();
  }, []);

  const loadOptions = async () => {
    try {
      const [depts, emps] = await Promise.all([listDepartments(), getActiveEmployees()]);
      setDepartments(depts);
      setEmployees(emps);
    } catch (e) {
      console.error(e);
    }
  };

  const loadActiveCycle = async () => {
    try {
      setIsLoading(true);
      // Try to find an active cycle
      const cycles = await listAuditCycles({ status: "Planned" });
      let activeCycle = cycles.length > 0 ? cycles[0] : null;
      
      if (!activeCycle) {
        const inProgress = await listAuditCycles({ status: "InProgress" });
        if (inProgress.length > 0) activeCycle = inProgress[0];
      }
      
      // If none active, grab the latest closed one for demo
      if (!activeCycle) {
        const closed = await listAuditCycles({ status: "Closed" });
        if (closed.length > 0) activeCycle = closed[0];
      }

      if (!activeCycle) {
        setIsLoading(false);
        return; // No cycles at all
      }

      setCycle(activeCycle);

      // Resolve auditor names
      if (activeCycle.auditorUserIds && activeCycle.auditorUserIds.length > 0) {
        const profiles = await Promise.all(activeCycle.auditorUserIds.map(uid => getUserProfile(uid)));
        const names = profiles.filter(Boolean).map(p => p.name || p.email).join(", ");
        setAuditorNames(names);
      }

      // Load expected assets
      let assetsQuery = query(collection(db, "assets"));
      if (activeCycle.scopeType === "Department") {
        assetsQuery = query(
          collection(db, "assets"), 
          where("currentHolderType", "==", "Department"),
          where("currentHolderId", "==", activeCycle.scopeValue)
        );
      } else if (activeCycle.scopeType === "Location") {
        assetsQuery = query(
          collection(db, "assets"), 
          where("location", "==", activeCycle.scopeValue)
        );
      }
      
      const assetsSnap = await getDocs(assetsQuery);
      setExpectedAssets(assetsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // If closed, load report
      if (activeCycle.status === "Closed") {
        const report = await getDiscrepancyReport(activeCycle.id);
        setDiscrepancyReport(report);
      }

      // Listen to checks
      const checksQuery = collection(db, "auditCycles", activeCycle.id, "assetChecks");
      const unsubscribe = onSnapshot(checksQuery, (snap) => {
        const newChecks = {};
        snap.docs.forEach(d => {
          newChecks[d.id] = d.data();
        });
        setChecks(newChecks);
      });

      return () => unsubscribe();
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to load audit cycle.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerificationChange = async (assetId, assetTag, newResult) => {
    if (cycle.status === "Closed") return;
    try {
      await addAssetCheck(cycle.id, assetId, {
        assetTag,
        verifiedByUserId: currentUser.uid,
        result: newResult
      });
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to update verification.");
      setTimeout(() => setErrorMsg(""), 3000);
    }
  };

  const handleCloseCycle = async () => {
    if (!cycle || cycle.status === "Closed" || isClosing) return;
    
    setIsClosing(true);
    try {
      await closeAuditCycle(cycle.id, { uid: currentUser.uid, name: currentUser.displayName || currentUser.email });
      setToastMsg("Audit cycle closed successfully.");
      setTimeout(() => setToastMsg(""), 3000);
      
      // Reload cycle to show closed state
      loadActiveCycle();
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to close audit cycle.");
      setTimeout(() => setErrorMsg(""), 4000);
    } finally {
      setIsClosing(false);
    }
  };

  const handleToggleAuditor = (uid) => {
    setCreateForm(prev => {
      const exists = prev.auditorUserIds.includes(uid);
      return {
        ...prev,
        auditorUserIds: exists 
          ? prev.auditorUserIds.filter(id => id !== uid)
          : [...prev.auditorUserIds, uid]
      };
    });
  };

  const handleCreateAudit = async (e) => {
    e.preventDefault();
    if (!createForm.scopeValue || !createForm.startDate || !createForm.endDate) {
       setErrorMsg("Please fill in all fields.");
       setTimeout(() => setErrorMsg(""), 3000);
       return;
    }
    if (createForm.auditorUserIds.length === 0) {
       setErrorMsg("Please select at least one auditor.");
       setTimeout(() => setErrorMsg(""), 3000);
       return;
    }
    
    try {
      setIsLoading(true);
      await createAuditCycle({
        scopeType: createForm.scopeType,
        scopeValue: createForm.scopeValue,
        startDate: new Date(createForm.startDate),
        endDate: new Date(createForm.endDate),
        auditorUserIds: createForm.auditorUserIds
      }, { uid: currentUser.uid, name: currentUser.displayName || currentUser.email });
      
      setToastMsg("Audit cycle created successfully!");
      setTimeout(() => setToastMsg(""), 3000);
      setShowCreateModal(false);
      loadActiveCycle();
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to create audit cycle.");
      setTimeout(() => setErrorMsg(""), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const renderCreateModal = () => {
    if (!showCreateModal) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
        <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleCreateAudit}>
          <div className="modal-header">
            <h2>Start New Audit Cycle</h2>
            <button type="button" className="modal-close" onClick={() => setShowCreateModal(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Scope Type</label>
              <div className="modal-status-toggle" style={{display: 'flex', gap: '8px', marginBottom: '8px'}}>
                <button
                  type="button"
                  className={`status-toggle-btn ${createForm.scopeType === "Department" ? "active" : ""}`}
                  onClick={() => setCreateForm({ ...createForm, scopeType: "Department", scopeValue: "" })}
                >
                  Department
                </button>
                <button
                  type="button"
                  className={`status-toggle-btn ${createForm.scopeType === "Location" ? "active" : ""}`}
                  onClick={() => setCreateForm({ ...createForm, scopeType: "Location", scopeValue: "" })}
                >
                  Location
                </button>
              </div>
            </div>
            
            <div className="form-group">
              <label className="form-label">{createForm.scopeType} Value</label>
              {createForm.scopeType === "Department" ? (
                <select 
                  className="form-input form-select"
                  value={createForm.scopeValue}
                  onChange={(e) => setCreateForm({...createForm, scopeValue: e.target.value})}
                  required
                >
                  <option value="">Select Department...</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="form-input"
                  placeholder="e.g. Headquarters"
                  value={createForm.scopeValue}
                  onChange={(e) => setCreateForm({...createForm, scopeValue: e.target.value})}
                  required
                />
              )}
            </div>
            
            <div style={{display: 'flex', gap: '16px'}}>
              <div className="form-group" style={{flex: 1}}>
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={createForm.startDate}
                  onChange={(e) => setCreateForm({...createForm, startDate: e.target.value})}
                  required
                />
              </div>
              <div className="form-group" style={{flex: 1}}>
                <label className="form-label">End Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={createForm.endDate}
                  onChange={(e) => setCreateForm({...createForm, endDate: e.target.value})}
                  required
                />
              </div>
            </div>
            
            <div className="form-group">
              <label className="form-label">Assign Auditors</label>
              <div className="multi-select-container" style={{maxHeight: '120px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px', background: 'var(--background)'}}>
                {employees.map(emp => (
                  <label key={emp.id} style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer', color: 'var(--text-primary)'}}>
                    <input 
                      type="checkbox"
                      checked={createForm.auditorUserIds.includes(emp.id)}
                      onChange={() => handleToggleAuditor(emp.id)}
                    />
                    {emp.name || emp.email}
                  </label>
                ))}
              </div>
            </div>
          </div>
          
          <div className="modal-footer">
            <button type="button" className="btn-outline modal-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary modal-confirm" disabled={isLoading}>
              {isLoading ? "Starting..." : "Start Audit"}
            </button>
          </div>
        </form>
      </div>
    );
  };

  if (isLoading) {
    return <div className="audit-container"><div className="empty-state">Loading audit cycle...</div></div>;
  }

  if (!cycle) {
    return (
      <div className="audit-container">
        <div className="audit-header">
          <h3 className="section-title">Asset Audit</h3>
        </div>
        <div className="empty-state">
          <p style={{marginBottom: '20px'}}>No audit cycles found.</p>
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            Start New Audit Cycle
          </button>
        </div>
        {renderCreateModal()}
      </div>
    );
  }

  const isClosed = cycle.status === "Closed";
  
  // Format date range
  const formatCycleDates = () => {
    const start = cycle.startDate?.toDate ? cycle.startDate.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Unknown';
    const end = cycle.endDate?.toDate ? cycle.endDate.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Unknown';
    return `${start} - ${end}`;
  };

  const totalFlagged = discrepancyReport ? (discrepancyReport.missingCount + discrepancyReport.damagedCount) : 0;

  return (
    <div className="audit-container">
      <div className="audit-header">
        <div>
          <h3 className="section-title" style={{margin: '0 0 8px 0'}}>
            {cycle.scopeType === "Department" ? "Department Audit" : "Location Audit"}: {cycle.scopeValue} — {formatCycleDates()}
          </h3>
          <div className="audit-subtitle">Auditors: {auditorNames || "Unassigned"}</div>
        </div>
      </div>

      {toastMsg && <div className="toast success-toast">{toastMsg}</div>}
      {errorMsg && <div className="toast error-toast">{errorMsg}</div>}

      {isClosed && discrepancyReport && totalFlagged > 0 && (
        <div className="discrepancy-banner">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span>{totalFlagged} asset{totalFlagged !== 1 ? 's' : ''} flagged - discrepancy report generated automatically</span>
            <button 
              className="btn-secondary" 
              style={{padding: '4px 12px', fontSize: '13px'}}
              onClick={() => {
                const reportDiv = document.getElementById('discrepancy-report-details');
                if (reportDiv) reportDiv.style.display = reportDiv.style.display === 'none' ? 'block' : 'none';
              }}
            >
              View Report
            </button>
          </div>
          <div id="discrepancy-report-details" style={{display: 'none', marginTop: '12px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px'}}>
            <strong>Flagged Assets:</strong> {
              discrepancyReport.flaggedAssetIds?.map(id => {
                const asset = expectedAssets.find(a => a.id === id);
                return asset ? (asset.tag || asset.name || id) : id;
              }).join(", ") || "None"
            }
            <p style={{marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)'}}>
              These assets have been automatically marked as 'Lost' or 'Damaged' in the system. Check the table below for full verification details.
            </p>
          </div>
        </div>
      )}

      <div className="audit-table-wrapper">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Expected Location</th>
              <th>Verification</th>
            </tr>
          </thead>
          <tbody>
            {expectedAssets.map(asset => {
              const check = checks[asset.id];
              const result = check ? check.result : "Pending";
              
              return (
                <tr key={asset.id} className="audit-row">
                  <td><strong>{asset.tag || asset.name}</strong></td>
                  <td>{asset.location || "Unspecified"}</td>
                  <td>
                    {isClosed ? (
                      <span className={`pill pill-${result.toLowerCase()}`}>{result}</span>
                    ) : (
                      <select 
                        className={`pill pill-${result.toLowerCase()} verification-select`}
                        value={result}
                        onChange={(e) => handleVerificationChange(asset.id, asset.tag || asset.name, e.target.value)}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Verified">Verified</option>
                        <option value="Missing">Missing</option>
                        <option value="Damaged">Damaged</option>
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
            {expectedAssets.length === 0 && (
              <tr>
                <td colSpan="3" style={{textAlign: 'center', padding: '30px', color: 'var(--text-muted)'}}>
                  No expected assets found for this {cycle.scopeType?.toLowerCase() || 'scope'}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="audit-footer" style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
        <button 
          className="btn-primary" 
          onClick={handleCloseCycle} 
          disabled={isClosed || isClosing}
          style={{ width: '100%', maxWidth: '300px' }}
        >
          {isClosing ? "Closing..." : isClosed ? "Audit Cycle Closed" : "Close audit cycle"}
        </button>
        
        {isClosed && (
          <button 
            className="btn-secondary" 
            onClick={() => setShowCreateModal(true)}
            style={{ width: '100%', maxWidth: '300px' }}
          >
            Start New Audit Cycle
          </button>
        )}
      </div>

      {renderCreateModal()}
    </div>
  );
}
