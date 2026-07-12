import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { createMaintenanceRequest, updateMaintenanceStatus } from "../services/maintenanceService";

const COLUMNS = [
  { id: "Pending", label: "Pending", nextLabel: "Approve", nextStatus: "Approved" },
  { id: "Approved", label: "Approved", nextLabel: "Assign Tech", nextStatus: "TechnicianAssigned" },
  { id: "TechnicianAssigned", label: "Technician Assigned", nextLabel: "Start", nextStatus: "InProgress" },
  { id: "InProgress", label: "In Progress", nextLabel: "Resolve", nextStatus: "Resolved" },
  { id: "Resolved", label: "Resolved", nextLabel: null, nextStatus: null }
];

export default function Maintenance() {
  const { currentUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState(null);
  const [assets, setAssets] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [assetId, setAssetId] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [photoUrl, setPhotoUrl] = useState("");

  const [toastMsg, setToastMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Load Maintenance Requests (Real-time)
  useEffect(() => {
    const q = query(collection(db, "maintenanceRequests"), orderBy("raisedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          raisedAt: data.raisedAt?.toDate ? data.raisedAt.toDate() : null,
          resolvedAt: data.resolvedAt?.toDate ? data.resolvedAt.toDate() : null,
        };
      });
      setRequests(fetched);
    }, (error) => {
      console.error("Maintenance Listener Error:", error);
      setErrorMsg("Failed to load requests.");
    });

    return () => unsubscribe();
  }, []);

  // Fetch Assets for the Raise Request Modal
  const handleOpenModal = async () => {
    setIsModalOpen(true);
    try {
      const snap = await getDocs(collection(db, "assets"));
      const fetchedAssets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAssets(fetchedAssets);
      if (fetchedAssets.length > 0) setAssetId(fetchedAssets[0].id);
    } catch (err) {
      console.error("Error fetching assets:", err);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setAssetId("");
    setIssueDescription("");
    setPriority("Medium");
    setPhotoUrl("");
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (!assetId || !issueDescription) return;

    setIsSubmitting(true);
    try {
      const selectedAsset = assets.find(a => a.id === assetId);
      await createMaintenanceRequest({
        assetId,
        assetTag: selectedAsset?.tag || selectedAsset?.name || "Unknown Asset",
        raisedByUserId: currentUser.uid,
        issueDescription,
        priority,
        photoUrl: photoUrl || null,
      }, { uid: currentUser.uid, name: currentUser.displayName || currentUser.email });
      
      handleCloseModal();
      setToastMsg("Request raised successfully.");
      setTimeout(() => setToastMsg(""), 3000);
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to raise request.");
      setTimeout(() => setErrorMsg(""), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdvanceStatus = async (requestId, nextStatus) => {
    try {
      await updateMaintenanceStatus(
        requestId, 
        nextStatus, 
        { approvedByUserId: currentUser.uid, resolutionNotes: nextStatus === "Resolved" ? "Resolved via board" : null }, 
        { uid: currentUser.uid, name: currentUser.displayName || currentUser.email }
      );
      setToastMsg(`Status updated to ${nextStatus}`);
      setTimeout(() => setToastMsg(""), 3000);
    } catch (err) {
      console.error("Transaction Error:", err);
      setErrorMsg(err.message || "Failed to update status. Asset may be missing.");
      setTimeout(() => setErrorMsg(""), 4000);
    }
  };

  const handleDragStart = (e, requestId) => {
    e.dataTransfer.setData("text/plain", requestId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault();
    const requestId = e.dataTransfer.getData("text/plain");
    if (!requestId) return;
    
    const request = requests.find(r => r.id === requestId);
    if (!request || request.status === targetStatus) {
      return;
    }

    const currentIndex = COLUMNS.findIndex(c => c.id === request.status);
    const targetIndex = COLUMNS.findIndex(c => c.id === targetStatus);

    if (targetIndex <= currentIndex) {
      setErrorMsg("Can only move requests forward.");
      setTimeout(() => setErrorMsg(""), 3000);
      return;
    }

    setConfirmDrop({
      requestId,
      targetStatus,
      targetLabel: COLUMNS.find(c => c.id === targetStatus)?.label || targetStatus
    });
  };

  const handleConfirmDrop = async () => {
    if (!confirmDrop) return;
    await handleAdvanceStatus(confirmDrop.requestId, confirmDrop.targetStatus);
    setConfirmDrop(null);
  };

  return (
    <div className="maintenance-container" style={{ position: 'relative' }}>
      <div className="maintenance-header">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
          <h3 className="section-title" style={{margin: 0}}>Maintenance Board</h3>
          <button className="btn-primary" style={{width: 'auto', padding: '0 24px', marginTop: 0}} onClick={handleOpenModal}>
            + Raise Request
          </button>
        </div>
      </div>

      {toastMsg && <div className="toast success-toast">{toastMsg}</div>}
      {errorMsg && <div className="toast error-toast">{errorMsg}</div>}

      <div className="kanban-board">
        {COLUMNS.map(col => (
          <div 
            key={col.id} 
            className="kanban-column"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            <div className="kanban-column-header">{col.label}</div>
            <div className="kanban-column-content">
              {requests.filter(req => req.status === col.id).map(req => (
                <div 
                  key={req.id} 
                  className={`kanban-card status-${req.status.toLowerCase()}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, req.id)}
                  style={{ cursor: 'grab' }}
                >
                  <div className="kanban-card-tag">{req.assetTag}</div>
                  <div className="kanban-card-issue">{req.issueDescription}</div>
                  
                  {req.status === "Resolved" && req.resolvedAt && (
                    <div className="kanban-card-resolved-date">
                      resolved {req.resolvedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  )}

                  {col.nextStatus && (
                    <button 
                      className="btn-outline kanban-action-btn"
                      onClick={() => handleAdvanceStatus(req.id, col.nextStatus)}
                    >
                      {col.nextLabel}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="kanban-footer-note">
        Approving a card moves the asset to under maintenance, resolving it returns it to available. Drag and drop cards to move them.
      </div>

      {isModalOpen && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-card spotlight-card">
            <div className="login-card-header-bar">Raise Request</div>
            <div className="login-card-content" style={{paddingTop: '20px'}}>
              <form onSubmit={handleSubmitRequest} className="login-form">
                <div className="form-group">
                  <label className="form-label">Asset</label>
                  <select className="form-input" value={assetId} onChange={e => setAssetId(e.target.value)} required>
                    {assets.map(a => (
                      <option key={a.id} value={a.id}>{a.tag || a.name || `Asset ${a.id}`}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Issue Description</label>
                  <textarea 
                    className="form-input" 
                    style={{ height: '80px', paddingTop: '10px' }}
                    value={issueDescription} 
                    onChange={e => setIssueDescription(e.target.value)}
                    placeholder="E.g., Projector bulb not turning on"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-input" value={priority} onChange={e => setPriority(e.target.value)}>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Photo URL (Optional)</label>
                  <input 
                    type="url" 
                    className="form-input" 
                    value={photoUrl} 
                    onChange={e => setPhotoUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                  <button type="submit" className="btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Submit"}
                  </button>
                  <button type="button" className="btn-outline" onClick={handleCloseModal}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {confirmDrop && (
        <div className="custom-modal-overlay">
          <div className="custom-modal-card spotlight-card" style={{ maxWidth: '400px' }}>
            <div className="login-card-header-bar">Confirm Move</div>
            <div className="login-card-content" style={{paddingTop: '20px', paddingBottom: '20px'}}>
              <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)' }}>
                Are you sure you want to move this request to <strong>{confirmDrop.targetLabel}</strong>?
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" className="btn-primary" onClick={handleConfirmDrop}>
                  Confirm
                </button>
                <button type="button" className="btn-outline" onClick={() => setConfirmDrop(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
