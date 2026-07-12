import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listAllocations,
  allocateAsset,
  returnAsset,
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  getTransferRequests,
} from "../services/allocationService";
import { listAssets } from "../services/assetService";
import { listUsers } from "../services/userService";
import { listDepartments } from "../services/departmentService";
import { getAssetHistory } from "../services/assetService";
import {
  canDirectlyAllocate,
  canApproveTransfer,
  canReturnAsset,
  scopeAllocations,
} from "../utils/rbac";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(ts) {
  if (!ts) return "—";
  if (ts.toDate) ts = ts.toDate();
  if (ts instanceof Date) return ts.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return String(ts);
}
function isOverdue(alloc) {
  if (!alloc.expectedReturnDate || alloc.status !== "Active") return false;
  const d = alloc.expectedReturnDate.toDate ? alloc.expectedReturnDate.toDate() : new Date(alloc.expectedReturnDate);
  return d < new Date();
}

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ALLOC_STATUS_STYLES = {
  Active:            { cls: "asset-status-allocated",   label: "Active" },
  Returned:          { cls: "asset-status-available",   label: "Returned" },
  TransferRequested: { cls: "asset-status-reserved",    label: "Transfer Requested" },
  TransferApproved:  { cls: "asset-status-maintenance", label: "Transfer Approved" },
};

// ─── Allocate / Transfer Request Modal ──────────────────────────────────────────
function AllocateModal({ assets, employees, departments, allAllocations, onClose, onSaveAllocation, onSaveTransfer, loading, currentUser }) {
  const [form, setForm] = useState({
    assetId: "", holderType: "Employee", holderId: "", expectedReturnDate: "", reason: ""
  });
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const selectedAsset = assets.find(a => a.id === form.assetId);
  const activeAlloc = allAllocations.find(a => a.assetId === form.assetId && a.status === "Active");
  const isAllocated = !!activeAlloc;

  // Load history when asset changes
  useEffect(() => {
    if (!form.assetId) {
      setHistory([]);
      return;
    }
    setLoadingHistory(true);
    getAssetHistory(form.assetId)
      .then(setHistory)
      .catch(console.warn)
      .finally(() => setLoadingHistory(false));
  }, [form.assetId]);

  const holderOptions = form.holderType === "Employee"
    ? employees.filter(e => e.id !== activeAlloc?.holderId)
    : departments.filter(d => d.status === "Active");
  const selectedHolder = holderOptions.find(h => h.id === form.holderId);

  const canSubmitAllocation = !isAllocated && form.assetId && form.holderId;
  const canSubmitTransfer   = isAllocated && form.holderId && form.reason.trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 520, width: "100%" }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontFamily: "Outfit, sans-serif" }}>Asset Allocation &amp; Transfer</h2>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" style={{ color: "var(--text-secondary)" }}>Asset</label>
            <select id="alloc-asset-select" className="form-input form-select"
              style={{ backgroundColor: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)" }}
              value={form.assetId} onChange={e => setForm(f => ({ ...f, assetId: e.target.value, holderId: "", reason: "" }))}>
              <option value="">Select an asset...</option>
              {assets.map(a => (
                <option key={a.id} value={a.id}>{a.assetTag} - {a.name}</option>
              ))}
            </select>
          </div>

          {selectedAsset && isAllocated && (
            <div style={{ backgroundColor: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <p style={{ color: "#fca5a5", margin: 0, fontSize: 14, fontWeight: 500 }}>
                Already Allocated to {activeAlloc.holderName} {activeAlloc.departmentName ? `(${activeAlloc.departmentName})` : ""}
              </p>
              <p style={{ color: "#fca5a5", margin: "4px 0 0 0", fontSize: 13, opacity: 0.9 }}>
                Direct re-allocation is blocked - submit a transfer request below
              </p>
            </div>
          )}

          {selectedAsset && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 12 }}>
                {isAllocated ? "Transfer Request" : "New Allocation"}
              </h3>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                {isAllocated && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ color: "var(--text-muted)", fontSize: 12 }}>From</label>
                    <input className="form-input" disabled value={activeAlloc.holderName} style={{ backgroundColor: "rgba(255,255,255,0.02)", color: "var(--text-muted)" }} />
                  </div>
                )}
                
                <div className="form-group" style={{ marginBottom: 0, gridColumn: isAllocated ? "auto" : "span 2" }}>
                  <label className="form-label" style={{ color: "var(--text-muted)", fontSize: 12 }}>To</label>
                  <select className="form-input form-select" value={form.holderId} onChange={e => setForm(f => ({ ...f, holderId: e.target.value }))}>
                    <option value="">Select Employee...</option>
                    {holderOptions.map(h => (
                      <option key={h.id} value={h.id}>{h.name || h.email}</option>
                    ))}
                  </select>
                </div>
              </div>

              {isAllocated ? (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ color: "var(--text-muted)", fontSize: 12 }}>Reason</label>
                  <textarea className="form-input" rows={3} style={{ resize: "vertical", backgroundColor: "rgba(255,255,255,0.02)" }}
                    value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
                </div>
              ) : (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ color: "var(--text-muted)", fontSize: 12 }}>Expected Return Date <span style={{opacity: 0.5}}>(optional)</span></label>
                  <input className="form-input" type="date" value={form.expectedReturnDate} onChange={e => setForm(f => ({ ...f, expectedReturnDate: e.target.value }))} style={{ backgroundColor: "rgba(255,255,255,0.02)" }} />
                </div>
              )}
            </div>
          )}

          {selectedAsset && (
            <button className="btn-primary" style={{ backgroundColor: "rgba(20,83,45,0.8)", borderColor: "rgba(34,197,94,0.3)", color: "#4ade80", width: "100%", padding: "10px", marginBottom: 24 }}
              disabled={loading || (isAllocated ? !canSubmitTransfer : !canSubmitAllocation)}
              onClick={() => isAllocated ? onSaveTransfer(activeAlloc, form, selectedHolder) : onSaveAllocation(form, selectedHolder)}>
              {loading ? <span className="spinner" /> : "Submit Request"}
            </button>
          )}

          {selectedAsset && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16 }}>
              <h3 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, fontWeight: 500 }}>Allocation history</h3>
              {loadingHistory ? (
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}><span className="spinner" style={{width:12, height:12, marginRight:8}}/>Loading history...</p>
              ) : history.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No prior history.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {history.map(h => (
                    <div key={h.id} style={{ display: "flex", gap: 12, fontSize: 13 }}>
                      <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {h.timestamp?.toDate ? h.timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : "—"}
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}>- {h.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Return Modal ─────────────────────────────────────────────────────────────
function ReturnModal({ alloc, onClose, onConfirm, loading }) {
  const [notes, setNotes] = useState("");
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Mark as Returned</h2>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="modal-body">
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
            Returning <strong style={{ color: "var(--text-primary)" }}>{alloc.assetTag}</strong> from{" "}
            <strong style={{ color: "var(--text-primary)" }}>{alloc.holderName}</strong>.
            Asset will revert to <span style={{ color: "#34d399", fontWeight: 600 }}>Available</span>.
          </p>
          <div className="form-group">
            <label className="form-label">Condition Check-in Notes <span className="form-label-hint">(optional)</span></label>
            <textarea id="return-notes-input" className="form-input" rows={3}
              placeholder="e.g. Minor scratches, all accessories returned"
              style={{ resize: "vertical", fontFamily: "inherit" }}
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline modal-cancel" onClick={onClose}>Cancel</button>
          <button id="confirm-return" className="btn-primary modal-confirm"
            disabled={loading} onClick={() => onConfirm(notes)}>
            {loading ? <span className="spinner" /> : "Confirm Return"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Transfer Request Modal ───────────────────────────────────────────────────
function TransferRequestModal({ alloc, allAllocations = [], assets = [], employees, departments, onClose, onConfirm, loading, currentUser }) {
  const isNewRequest = alloc?._new === true;
  const [form, setForm] = useState({ assetAllocId: "", holderType: "Employee", holderId: "", reason: "" });

  // When a new request (from header button), derive alloc from selected asset
  const selectedAlloc = isNewRequest
    ? allAllocations.find(a => a.id === form.assetAllocId)
    : alloc;

  const holderOptions = form.holderType === "Employee"
    ? employees.filter(e => e.id !== selectedAlloc?.holderId)
    : departments.filter(d => d.status === "Active");
  const valid = (isNewRequest ? form.assetAllocId : true) && form.holderId && form.reason.trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Request Transfer</h2>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="modal-body">
          {isNewRequest ? (
            <div className="form-group">
              <label className="form-label">Select Asset to Request Transfer For *</label>
              <select id="transfer-asset-select" className="form-input form-select"
                value={form.assetAllocId}
                onChange={e => setForm(f => ({ ...f, assetAllocId: e.target.value, holderId: "" }))}>
                <option value="">Select an asset…</option>
                {allAllocations.filter(a => a.status === "Active").map(a => {
                  const asset = assets.find(x => x.id === a.assetId);
                  return (
                    <option key={a.id} value={a.id}>
                      {a.assetTag}{asset ? ` — ${asset.name}` : ""} (held by {a.holderName})
                    </option>
                  );
                })}
              </select>
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
              Asset <strong style={{ color: "#a78bfa" }}>{alloc.assetTag}</strong> is currently held by{" "}
              <strong style={{ color: "var(--text-primary)" }}>{alloc.holderName}</strong>.
              A transfer request will be sent for approval.
            </p>
          )}
          <div className="form-group">
            <label className="form-label">Transfer To</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Employee", "Department"].map(t => (
                <button key={t} type="button"
                  className={`status-toggle-btn ${form.holderType === t ? "active" : ""}`}
                  onClick={() => setForm(f => ({ ...f, holderType: t, holderId: "" }))}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{form.holderType} *</label>
            <select id="transfer-holder-select" className="form-input form-select"
              value={form.holderId} onChange={e => setForm(f => ({ ...f, holderId: e.target.value }))}>
              <option value="">Select {form.holderType}</option>
              {holderOptions.map(h => <option key={h.id} value={h.id}>{h.name || h.email}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Reason for Transfer *</label>
            <textarea id="transfer-reason-input" className="form-input" rows={3}
              placeholder="Explain why this transfer is needed…"
              style={{ resize: "vertical", fontFamily: "inherit" }}
              value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline modal-cancel" onClick={onClose}>Cancel</button>
          <button id="confirm-transfer-request" className="btn-primary modal-confirm"
            disabled={loading || !valid}
            onClick={() => {
              const resolvedAlloc = isNewRequest ? selectedAlloc : alloc;
              onConfirm(form, holderOptions.find(h => h.id === form.holderId), resolvedAlloc);
            }}>
            {loading ? <span className="spinner" /> : "Request Transfer"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Approve Transfer Panel ───────────────────────────────────────────────────
function TransferApprovalPanel({ alloc, employees, departments, onClose, onApprove, onReject, loading }) {
  const [transferRequests, setTransferRequests] = useState([]);
  const [loadingReqs, setLoadingReqs] = useState(true);

  useEffect(() => {
    setLoadingReqs(true);
    getTransferRequests(alloc.id)
      .then(setTransferRequests)
      .catch(console.warn)
      .finally(() => setLoadingReqs(false));
  }, [alloc.id]);

  const pendingReq = transferRequests.find(r => r.status === "Requested");

  return (
    <>
      <div className="detail-panel-backdrop" onClick={onClose} />
      <aside className="detail-panel">
        <div className="detail-panel-header">
          <div className="detail-panel-title-row">
            <div>
              <h2 className="detail-panel-name">Transfer Request</h2>
              <span className="detail-panel-tag">{alloc.assetTag}</span>
            </div>
            <button className="modal-close" onClick={onClose}><CloseIcon /></button>
          </div>
          <div className="detail-panel-badges">
            <span className="asset-status-pill asset-status-reserved">Transfer Requested</span>
          </div>
        </div>

        <div className="detail-panel-body" style={{ padding: "16px 20px" }}>
          <div className="detail-fields-section">
            <p className="detail-fields-heading">Current Allocation</p>
            <div className="detail-fields-grid">
              <div className="detail-field"><span className="asset-detail-label">Asset</span><span className="asset-detail-value" style={{ fontFamily: "monospace", color: "#a78bfa" }}>{alloc.assetTag}</span></div>
              <div className="detail-field"><span className="asset-detail-label">Current Holder</span><span className="asset-detail-value">{alloc.holderName}</span></div>
              <div className="detail-field"><span className="asset-detail-label">Allocated On</span><span className="asset-detail-value">{fmt(alloc.allocatedAt)}</span></div>
              <div className="detail-field"><span className="asset-detail-label">Expected Return</span><span className="asset-detail-value">{fmt(alloc.expectedReturnDate)}</span></div>
            </div>
          </div>

          {loadingReqs ? (
            <div className="assets-loading-state"><span className="spinner" /><p>Loading request…</p></div>
          ) : pendingReq ? (
            <div className="detail-fields-section">
              <p className="detail-fields-heading">Pending Transfer Request</p>

              {/* WHO → WHO summary */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px", minWidth: 0 }}>
                  <p style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>From</p>
                  <p style={{ color: "var(--text-primary)", fontWeight: 600, margin: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alloc.holderName}</p>
                  {alloc.departmentName && <p style={{ color: "var(--text-muted)", fontSize: 11, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alloc.departmentName}</p>}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.7)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                <div style={{ background: "rgba(124,58,237,0.10)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: 8, padding: "8px 10px", minWidth: 0 }}>
                  <p style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 2px" }}>To</p>
                  <p style={{ color: "#a78bfa", fontWeight: 600, margin: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pendingReq.newHolderName || employees.find(e => e.id === pendingReq.requestedForUserId)?.name || departments.find(d => d.id === pendingReq.requestedForUserId)?.name || "Unknown"}
                  </p>
                  <p style={{ color: "var(--text-muted)", fontSize: 11, margin: "2px 0 0" }}>{pendingReq.newHolderType || "Employee"}</p>
                </div>
              </div>

              <div style={{ background: "rgba(124,58,237,0.07)", borderRadius: 10, padding: 14, border: "1px solid rgba(124,58,237,0.15)", marginBottom: 14 }}>
                <p style={{ color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 4px" }}>Reason</p>
                <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                  {pendingReq.reason || "No reason provided"}
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>
                  Requested by <strong style={{ color: "var(--text-secondary)" }}>
                    {pendingReq.requestedByName || employees.find(e => e.id === pendingReq.requestedByUserId)?.name || employees.find(e => e.id === pendingReq.requestedByUserId)?.email || "Unknown"}
                  </strong> &middot; {fmt(pendingReq.requestedAt)}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button id="approve-transfer-btn" className="btn-primary modal-confirm"
                  style={{ flex: 1 }} disabled={loading}
                  onClick={() => onApprove(alloc, pendingReq, employees, departments)}>
                  {loading ? <span className="spinner" /> : "✓ Approve"}
                </button>
                <button id="reject-transfer-btn" className="btn-outline modal-cancel asset-delete-confirm"
                  style={{ flex: 1 }} disabled={loading}
                  onClick={() => onReject(alloc.id, pendingReq.id)}>
                  {loading ? <span className="spinner" /> : "✕ Reject"}
                </button>
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 14, padding: "12px 0" }}>No pending transfer requests.</p>
          )}

          {transferRequests.length > 0 && (
            <div className="detail-fields-section" style={{ marginTop: 16 }}>
              <p className="detail-fields-heading">Request History</p>
              {transferRequests.map(r => (
                <div key={r.id} className="asset-history-item" style={{ paddingLeft: 0 }}>
                  <div className={`asset-history-dot history-dot-${r.status === "Approved" ? "allocation" : r.status === "Rejected" ? "auditflag" : "transfer"}`} />
                  <div className="asset-history-content">
                    <p className="asset-history-desc">
                      <strong>{r.status}</strong>
                      {r.requestedByName ? ` — by ${r.requestedByName}` : ""}
                      {r.newHolderName ? ` → ${r.newHolderName}` : ""}
                      {r.reason ? ` · "${r.reason}"` : ""}
                    </p>
                    <span className="asset-history-meta">{fmt(r.requestedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Allocation Row Action Menu ────────────────────────────────────────────────────
function AllocActionMenu({ alloc, role, currentUserId, onReturn, onTransferRequest, onViewTransfer }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Role-gated capabilities (from rbac.js)
  const allowReturn  = canReturnAsset(role);
  const allowApprove = canApproveTransfer(role);
  // Anyone can request a transfer on allocations they can see
  const allowRequest = true;

  const isActive          = alloc.status === "Active";
  const isTransferPending = alloc.status === "TransferRequested";

  const hasAnyAction = (isActive && (allowReturn || allowRequest)) ||
                       (isTransferPending && allowApprove);
  if (!hasAnyAction) return null;

  return (
    <div className="action-menu-wrap" ref={ref}>
      <button className="action-dots-btn" onClick={e => { e.stopPropagation(); setOpen(v => !v); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="action-menu-dropdown">
          {isActive && allowReturn && (
            <button className="action-menu-item" onClick={e => { e.stopPropagation(); setOpen(false); onReturn(alloc); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.5" /></svg>
              Mark Returned
            </button>
          )}
          {isActive && allowRequest && (
            <button className="action-menu-item" onClick={e => { e.stopPropagation(); setOpen(false); onTransferRequest(alloc); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
              Request Transfer
            </button>
          )}
          {isTransferPending && allowApprove && (
            <button className="action-menu-item" onClick={e => { e.stopPropagation(); setOpen(false); onViewTransfer(alloc); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              Review Transfer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────────
export default function AllocationTransfer() {
  const { currentUser, userProfile } = useAuth();
  const role = userProfile?.role || "Employee";

  // Derived permission flags (from rbac.js)
  const allowDirectAllocate = canDirectlyAllocate(role);

  const [allAllocations, setAllAllocations] = useState([]);
  const [assets,         setAssets]         = useState([]);
  const [employees,      setEmployees]       = useState([]);
  const [departments,    setDepartments]     = useState([]);
  const [loading,        setLoading]         = useState(true);
  const [modalLoading,   setModalLoading]    = useState(false);
  const [error,          setError]           = useState(null);

  // Tab: "all" | "active" | "overdue" | "transfers"
  const [activeTab, setActiveTab] = useState("active");

  // Modals
  const [showAllocate,         setShowAllocate]         = useState(false);
  const [returnAlloc,          setReturnAlloc]          = useState(null);
  const [transferReqAlloc,     setTransferReqAlloc]     = useState(null);
  const [transferApproveAlloc, setTransferApproveAlloc] = useState(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allocs, assetList, empList, deptList] = await Promise.all([
        listAllocations({ maxResults: 300 }),
        listAssets({ maxResults: 300 }),
        listUsers(),
        listDepartments(),
      ]);
      setAllAllocations(allocs);
      setAssets(assetList);
      setEmployees(empList);
      setDepartments(deptList);
    } catch (err) {
      console.error(err);
      setError("Failed to load data: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtered tabs ───────────────────────────────────────────────────────────────
  // Uses rbac.js scoping: Admin/AssetManager/DeptHead see all; Employee sees only their own
  const myAllocations = scopeAllocations(allAllocations, role, currentUser?.uid, userProfile?.departmentId);

  const tabData = {
    active:    myAllocations.filter(a => a.status === "Active" && !isOverdue(a)),
    overdue:   myAllocations.filter(a => isOverdue(a)),
    transfers: myAllocations.filter(a => a.status === "TransferRequested"),
    all:       myAllocations,
  };
  const displayed = tabData[activeTab] || myAllocations;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const actor = () => ({ uid: currentUser.uid, name: userProfile?.name || currentUser.email });

  async function handleAllocate(form, selectedHolder) {
    setModalLoading(true);
    try {
      const asset = assets.find(a => a.id === form.assetId);
      await allocateAsset({
        assetId: form.assetId,
        assetTag: asset?.assetTag || "",
        holderId: form.holderId,
        holderType: form.holderType,
        holderName: selectedHolder?.name || selectedHolder?.email || "",
        departmentId:   form.holderType === "Department" ? form.holderId : (selectedHolder?.departmentId || null),
        departmentName: form.holderType === "Department" ? (selectedHolder?.name || "") : (selectedHolder?.departmentName || null),
        allocatedByUserId: currentUser.uid,
        expectedReturnDate: form.expectedReturnDate ? new Date(form.expectedReturnDate) : null,
      }, actor());
      setShowAllocate(false);
      await loadData();
    } catch (err) { alert(err.message); }
    finally { setModalLoading(false); }
  }

  async function handleReturn(notes) {
    setModalLoading(true);
    try {
      await returnAsset(returnAlloc.id, { returnConditionNotes: notes }, actor());
      setReturnAlloc(null);
      await loadData();
    } catch (err) { alert(err.message); }
    finally { setModalLoading(false); }
  }

  async function handleTransferRequest(form, selectedHolder, resolvedAlloc) {
    setModalLoading(true);
    const targetAlloc = resolvedAlloc || transferReqAlloc;
    try {
      if (!targetAlloc?.id) { alert("Please select a valid asset to transfer."); return; }
      await requestTransfer(targetAlloc.id, {
        requestedByUserId: currentUser.uid,
        requestedByName: userProfile?.name || currentUser.email || "",
        requestedForUserId: form.holderId,
        reason: form.reason,
        newHolderType: form.holderType,
        newHolderName: selectedHolder?.name || selectedHolder?.email || "",
      });
      setTransferReqAlloc(null);
      await loadData();
    } catch (err) { alert(err.message); }
    finally { setModalLoading(false); }
  }

  async function handleApproveTransfer(alloc, req, empList, deptList) {
    setModalLoading(true);
    try {
      const holderType = req.newHolderType || "Employee";
      const holderList = holderType === "Employee" ? empList : deptList;
      const newHolder  = holderList.find(h => h.id === req.requestedForUserId);
      await approveTransfer(alloc.id, req.id, currentUser.uid, {
        holderId:       req.requestedForUserId,
        holderType,
        holderName:     newHolder?.name || newHolder?.email || req.requestedForUserId,
        departmentId:   holderType === "Department" ? req.requestedForUserId : (newHolder?.departmentId || null),
        departmentName: holderType === "Department" ? (newHolder?.name || "") : (newHolder?.departmentName || null),
      }, actor());
      setTransferApproveAlloc(null);
      await loadData();
    } catch (err) { alert(err.message); }
    finally { setModalLoading(false); }
  }

  async function handleRejectTransfer(allocationId, requestId) {
    setModalLoading(true);
    try {
      await rejectTransfer(allocationId, requestId, currentUser.uid);
      setTransferApproveAlloc(null);
      await loadData();
    } catch (err) { alert(err.message); }
    finally { setModalLoading(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="assets-page">

      {/* Header */}
      <div className="org-header">
        <div>
          <h1 className="org-title">Allocation &amp; Transfer</h1>
          <p className="org-subtitle">
            {loading ? "Loading…" : `${myAllocations.filter(a => a.status === "Active").length} active · ${tabData.overdue.length} overdue · ${tabData.transfers.length} pending transfers`}
          </p>
        </div>
        {/* Admin/AssetManager: direct Allocate; DeptHead/Employee: open Transfer Request */}
        {allowDirectAllocate ? (
          <button id="allocate-asset-btn" className="org-add-btn" onClick={() => setShowAllocate(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Allocate Asset
          </button>
        ) : (
          <button id="request-transfer-btn" className="org-add-btn" onClick={() => setTransferReqAlloc({ id: null, assetTag: "", holderName: "", _new: true })}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            Request Transfer
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="org-tabs-bar" style={{ marginBottom: 0 }}>
        <div className="org-tabs">
          {[
            { id: "active",    label: "Active",    count: tabData.active.length },
            { id: "overdue",   label: "Overdue",   count: tabData.overdue.length },
            { id: "transfers", label: "Transfers Pending", count: tabData.transfers.length },
            { id: "all",       label: "All",       count: tabData.all.length },
          ].map(t => (
            <button key={t.id} className={`org-tab ${activeTab === t.id ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}>
              {t.label}
              {t.count > 0 && (
                <span className="detail-tab-count" style={t.id === "overdue" && t.count > 0 ? { background: "rgba(248,113,113,0.15)", borderColor: "rgba(248,113,113,0.3)", color: "#f87171" } : {}}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="org-content-card assets-table-card" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        {error ? (
          <div className="assets-empty-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <p>{error}</p>
            <button className="org-add-btn" style={{ marginTop: 8 }} onClick={loadData}>Retry</button>
          </div>
        ) : loading ? (
          <div className="assets-loading-state"><span className="spinner" /><p>Loading allocations…</p></div>
        ) : displayed.length === 0 ? (
          <div className="assets-empty-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>No allocations in this category</p>
            <span>{canAllocate ? 'Click "Allocate Asset" to get started.' : "No assets are currently allocated to you."}</span>
          </div>
        ) : (
          <div className="org-table-wrap">
            <table className="org-table assets-table">
              <thead>
                <tr>
                  <th>Asset Tag</th>
                  <th>Asset Name</th>
                  <th>Holder</th>
                  <th>Type</th>
                  <th>Department</th>
                  <th>Allocated On</th>
                  <th>Expected Return</th>
                  <th>Status</th>
                  <th className="assets-th-actions" />
                </tr>
              </thead>
              <tbody>
                {displayed.map(alloc => {
                  const asset = assets.find(a => a.id === alloc.assetId);
                  const si = ALLOC_STATUS_STYLES[alloc.status] || ALLOC_STATUS_STYLES.Active;
                  const overdue = isOverdue(alloc);
                  return (
                    <tr key={alloc.id} className="assets-row">
                      <td className="assets-tag-cell">
                        <span style={{ fontFamily: "monospace", color: "#a78bfa" }}>{alloc.assetTag}</span>
                      </td>
                      <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                        {asset?.name || <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                      <td>{alloc.holderName || "—"}</td>
                      <td className="org-cell-muted">{alloc.holderType || "—"}</td>
                      <td className="org-cell-muted">{alloc.departmentName || "—"}</td>
                      <td className="org-cell-muted">{fmt(alloc.allocatedAt)}</td>
                      <td>
                        {alloc.expectedReturnDate ? (
                          <span style={{ color: overdue ? "#f87171" : "var(--text-secondary)", fontWeight: overdue ? 600 : 400 }}>
                            {overdue && "⚠ "}
                            {fmt(alloc.expectedReturnDate)}
                          </span>
                        ) : <span className="org-cell-muted">—</span>}
                      </td>
                      <td>
                        <span className={`asset-status-pill ${si.cls}`}>{si.label}</span>
                      </td>
                      <td className="assets-actions-cell" onClick={e => e.stopPropagation()}>
                        <AllocActionMenu
                          alloc={alloc}
                          role={role}
                          currentUserId={currentUser?.uid}
                          onReturn={a => setReturnAlloc(a)}
                          onTransferRequest={a => setTransferReqAlloc(a)}
                          onViewTransfer={a => setTransferApproveAlloc(a)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="org-table-footer">
              <p className="org-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                ⚠ = overdue return · Use the ⋮ menu to return or transfer assets
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modals — gated by role */}
      {showAllocate && allowDirectAllocate && (
        <AllocateModal assets={assets} employees={employees} departments={departments} allAllocations={allAllocations}
          onClose={() => setShowAllocate(false)}
          onSaveAllocation={handleAllocate}
          onSaveTransfer={async (activeAlloc, form, selectedHolder) => {
            setModalLoading(true);
            try {
              await requestTransfer(activeAlloc.id, {
                requestedByUserId: currentUser.uid,
                requestedByName: userProfile?.name || currentUser.email || "",
                requestedForUserId: form.holderId,
                reason: form.reason,
                newHolderType: form.holderType,
                newHolderName: selectedHolder?.name || selectedHolder?.email || "",
              });
              setShowAllocate(false);
              await loadData();
            } catch (err) { alert(err.message); }
            finally { setModalLoading(false); }
          }}
          loading={modalLoading} currentUser={currentUser} />
      )}
      {returnAlloc && (
        <ReturnModal alloc={returnAlloc}
          onClose={() => setReturnAlloc(null)} onConfirm={handleReturn} loading={modalLoading} />
      )}
      {transferReqAlloc && (
        <TransferRequestModal
          alloc={transferReqAlloc}
          allAllocations={allAllocations}
          assets={assets}
          employees={employees}
          departments={departments}
          onClose={() => setTransferReqAlloc(null)}
          onConfirm={handleTransferRequest}
          loading={modalLoading}
          currentUser={currentUser} />
      )}
      {transferApproveAlloc && (
        <TransferApprovalPanel alloc={transferApproveAlloc} employees={employees} departments={departments}
          onClose={() => setTransferApproveAlloc(null)}
          onApprove={handleApproveTransfer} onReject={handleRejectTransfer} loading={modalLoading} />
      )}
    </div>
  );
}
