import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { listAuditCycles, addAssetCheck, closeAuditCycle, getDiscrepancyReport, createAuditCycle } from "../services/auditService";
import { getUserProfile } from "../services/userService";

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

  useEffect(() => {
    loadActiveCycle();
  }, []);

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

  const handleSeedTestAudit = async () => {
    try {
      setIsLoading(true);
      await createAuditCycle({
        scopeType: "Location",
        scopeValue: "Headquarters",
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days
        auditorUserIds: [currentUser.uid]
      }, { uid: currentUser.uid, name: currentUser.displayName || currentUser.email });
      
      setToastMsg("Test audit cycle created!");
      setTimeout(() => setToastMsg(""), 3000);
      loadActiveCycle();
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to create test audit.");
    } finally {
      setIsLoading(false);
    }
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
          <button className="btn-primary" onClick={handleSeedTestAudit}>
            Create Test Audit Cycle
          </button>
        </div>
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
          {totalFlagged} asset{totalFlagged !== 1 ? 's' : ''} flagged - discrepancy report generated automatically
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
            onClick={handleSeedTestAudit}
            style={{ width: '100%', maxWidth: '300px' }}
          >
            Start New Test Audit
          </button>
        )}
      </div>
    </div>
  );
}
