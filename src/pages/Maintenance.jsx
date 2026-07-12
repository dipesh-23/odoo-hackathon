import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { listAssets } from "../services/assetService";
import {
  createMaintenanceRequest,
  listMaintenanceRequests,
  updateMaintenanceStatus,
} from "../services/maintenanceService";
import { canApproveMaintenance } from "../utils/rbac";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const PRIORITY_STYLES = {
  Low:    { bg: "rgba(100,116,139,0.15)", color: "#94a3b8", border: "rgba(100,116,139,0.3)" },
  Medium: { bg: "rgba(245,158,11,0.15)",  color: "#fbbf24", border: "rgba(245,158,11,0.3)" },
  High:   { bg: "rgba(239,68,68,0.15)",   color: "#f87171", border: "rgba(239,68,68,0.3)" },
};
const STATUS_STYLES = {
  Pending:             { bg: "rgba(245,158,11,0.12)",  color: "#fbbf24", border: "rgba(245,158,11,0.3)" },
  Approved:            { bg: "rgba(139,92,246,0.12)",  color: "#a78bfa", border: "rgba(139,92,246,0.3)" },
  TechnicianAssigned:  { bg: "rgba(59,130,246,0.12)",  color: "#60a5fa", border: "rgba(59,130,246,0.3)" },
  InProgress:          { bg: "rgba(16,185,129,0.12)",  color: "#34d399", border: "rgba(16,185,129,0.3)" },
  Resolved:            { bg: "rgba(100,116,139,0.12)", color: "#94a3b8", border: "rgba(100,116,139,0.3)" },
  Rejected:            { bg: "rgba(239,68,68,0.12)",   color: "#f87171", border: "rgba(239,68,68,0.3)" },
};
function Badge({ label, styles }) {
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: styles.bg, color: styles.color, border: `1px solid ${styles.border}` }}>
      {label.replace("TechnicianAssigned", "Assigned")}
    </span>
  );
}

// ─── Raise Ticket Modal ────────────────────────────────────────────────────────
function RaiseTicketModal({ myAssets, onClose, onConfirm, loading }) {
  const [form, setForm] = useState({ assetId: "", priority: "Medium", issueDescription: "" });
  const selectedAsset = myAssets.find(a => a.id === form.assetId);
  const valid = form.assetId && form.issueDescription.trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Raise Maintenance Request</h2>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Asset *</label>
            <select id="maint-asset-select" className="form-input form-select"
              value={form.assetId} onChange={e => setForm(f => ({ ...f, assetId: e.target.value }))}>
              <option value="">Select your asset…</option>
              {myAssets.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.assetTag ? ` (${a.assetTag})` : ""}
                </option>
              ))}
            </select>
            {selectedAsset && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                Status: {selectedAsset.status} · {selectedAsset.location || "No location"}
              </p>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Priority</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Low", "Medium", "High"].map(p => (
                <button key={p} type="button"
                  className={`status-toggle-btn ${form.priority === p ? "active" : ""}`}
                  onClick={() => setForm(f => ({ ...f, priority: p }))}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Issue Description *</label>
            <textarea id="maint-issue-input" className="form-input" rows={4}
              placeholder="Describe the issue in detail…"
              style={{ resize: "vertical", fontFamily: "inherit" }}
              value={form.issueDescription}
              onChange={e => setForm(f => ({ ...f, issueDescription: e.target.value }))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline modal-cancel" onClick={onClose}>Cancel</button>
          <button id="confirm-raise-ticket" className="btn-primary modal-confirm"
            disabled={loading || !valid} onClick={() => onConfirm(form, selectedAsset)}>
            {loading ? <span className="spinner" /> : "Submit Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Resolve Modal (Admin / AssetManager) ─────────────────────────────────────
function ResolveModal({ ticket, onClose, onConfirm, loading }) {
  const [form, setForm] = useState({
    newStatus: "Approved",
    technicianName: "",
    resolutionNotes: "",
  });
  const isResolving = form.newStatus === "Resolved";
  const valid = form.newStatus && (isResolving ? form.resolutionNotes.trim() : true);

  const nextStatuses = ["Approved", "TechnicianAssigned", "InProgress", "Resolved", "Rejected"]
    .filter(s => s !== ticket.status);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Update Maintenance Ticket</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
              {ticket.assetTag} · Raised by {ticket.raisedByName || ticket.raisedByUserId}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Issue</label>
            <p style={{ fontSize: 13, color: "var(--text-primary)", background: "var(--surface-hover)",
              padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
              {ticket.issueDescription}
            </p>
          </div>
          <div className="form-group">
            <label className="form-label">Update Status</label>
            <select id="resolve-status-select" className="form-input form-select"
              value={form.newStatus} onChange={e => setForm(f => ({ ...f, newStatus: e.target.value }))}>
              {nextStatuses.map(s => <option key={s} value={s}>{s.replace("TechnicianAssigned", "Technician Assigned")}</option>)}
            </select>
          </div>
          {(form.newStatus === "TechnicianAssigned" || form.newStatus === "InProgress") && (
            <div className="form-group">
              <label className="form-label">Technician Name</label>
              <input className="form-input" placeholder="Enter technician name"
                value={form.technicianName}
                onChange={e => setForm(f => ({ ...f, technicianName: e.target.value }))} />
            </div>
          )}
          {isResolving && (
            <div className="form-group">
              <label className="form-label">Resolution Notes *</label>
              <textarea id="resolve-notes-input" className="form-input" rows={3}
                placeholder="Describe how the issue was resolved…"
                style={{ resize: "vertical", fontFamily: "inherit" }}
                value={form.resolutionNotes}
                onChange={e => setForm(f => ({ ...f, resolutionNotes: e.target.value }))} />
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-outline modal-cancel" onClick={onClose}>Cancel</button>
          <button id="confirm-resolve-btn" className="btn-primary modal-confirm"
            disabled={loading || !valid} onClick={() => onConfirm(form)}>
            {loading ? <span className="spinner" /> : "Update Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ticket Row ────────────────────────────────────────────────────────────────
function TicketRow({ ticket, role, onUpdate, onClick }) {
  const canUpdate = canApproveMaintenance(role);
  return (
    <tr onClick={onClick}
      style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer",
        transition: "background 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.background = "var(--surface-hover)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <td className="org-cell">
        <p style={{ fontWeight: 600, fontSize: 13 }}>{ticket.assetTag || "—"}</p>
      </td>
      <td className="org-cell" style={{ maxWidth: 240 }}>
        <p style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ticket.issueDescription}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          by {ticket.raisedByName || "Unknown"} · {fmtDate(ticket.raisedAt)}
        </p>
      </td>
      <td className="org-cell">
        <Badge label={ticket.priority} styles={PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.Low} />
      </td>
      <td className="org-cell">
        <Badge label={ticket.status} styles={STATUS_STYLES[ticket.status] || STATUS_STYLES.Pending} />
      </td>
      <td className="org-cell-muted">{ticket.technicianName || "—"}</td>
      <td className="assets-actions-cell" onClick={e => e.stopPropagation()}>
        {canUpdate && ticket.status !== "Resolved" && ticket.status !== "Rejected" && (
          <button style={{
            background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)",
            color: "#a78bfa", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer",
          }} onClick={() => onUpdate(ticket)}>Update</button>
        )}
      </td>
    </tr>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function Maintenance() {
  const { currentUser, userProfile } = useAuth();
  const role = userProfile?.role || "Employee";
  const canApprove = canApproveMaintenance(role);

  const [allTickets,   setAllTickets]   = useState([]);
  const [myAssets,     setMyAssets]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modalLoading, setModalLoading] = useState(false);
  const [showRaise,    setShowRaise]    = useState(false);
  const [resolveTicket, setResolveTicket] = useState(null);
  const [activeTab,    setActiveTab]    = useState("Open");
  const [error,        setError]        = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tickets, assets] = await Promise.all([
        listMaintenanceRequests(),
        listAssets(),
      ]);

      // Admin/AssetManager see all; others see only tickets they raised
      const myTickets = canApprove
        ? tickets
        : tickets.filter(t => t.raisedByUserId === currentUser?.uid);

      setAllTickets(myTickets);

      // For raise modal: assets allocated to this user
      setMyAssets(assets.filter(a => a.holderId === currentUser?.uid || a.status === "Available"));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [canApprove, currentUser?.uid]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleRaise(form, selectedAsset) {
    setModalLoading(true);
    try {
      await createMaintenanceRequest({
        assetId: form.assetId,
        assetTag: selectedAsset?.assetTag || selectedAsset?.name || form.assetId,
        raisedByUserId: currentUser.uid,
        raisedByName: userProfile?.name || currentUser.email || "",
        issueDescription: form.issueDescription,
        priority: form.priority,
      }, { uid: currentUser.uid, name: userProfile?.name || currentUser.email || "" });
      setShowRaise(false);
      await loadData();
    } catch (err) { alert(err.message); }
    finally { setModalLoading(false); }
  }

  async function handleResolve(form) {
    setModalLoading(true);
    try {
      await updateMaintenanceStatus(resolveTicket.id, form.newStatus, {
        technicianName: form.technicianName || null,
        resolutionNotes: form.resolutionNotes || null,
        approvedByUserId: currentUser.uid,
      }, { uid: currentUser.uid, name: userProfile?.name || currentUser.email || "" });
      setResolveTicket(null);
      await loadData();
    } catch (err) { alert(err.message); }
    finally { setModalLoading(false); }
  }

  const openStatuses   = ["Pending", "Approved", "TechnicianAssigned", "InProgress"];
  const closedStatuses = ["Resolved", "Rejected"];
  const tabData = {
    Open:     allTickets.filter(t => openStatuses.includes(t.status)),
    Resolved: allTickets.filter(t => closedStatuses.includes(t.status)),
    All:      allTickets,
  };
  const displayed = tabData[activeTab] || [];

  return (
    <div className="assets-page">
      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          color: "#f87171", borderRadius: 10, padding: "12px 18px", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Header */}
      <div className="org-header">
        <div>
          <h1 className="org-title">Maintenance</h1>
          <p className="org-subtitle">
            {loading ? "Loading…" : `${tabData.Open.length} open · ${tabData.Resolved.length} resolved`}
          </p>
        </div>
        <button id="raise-ticket-btn" className="org-add-btn" onClick={() => setShowRaise(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Raise Request
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {["Open", "Resolved", "All"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 18px", borderRadius: 10, fontSize: 13, cursor: "pointer",
              fontWeight: activeTab === tab ? 600 : 400,
              background: activeTab === tab ? "rgba(139,92,246,0.15)" : "transparent",
              color: activeTab === tab ? "#a78bfa" : "var(--text-muted)",
              border: activeTab === tab ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
              transition: "all 0.15s",
            }}>
            {tab}
            <span style={{
              marginLeft: 8, fontSize: 11, padding: "2px 8px", borderRadius: 20,
              background: "rgba(139,92,246,0.12)", color: "#a78bfa",
            }}>{tabData[tab]?.length || 0}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="org-table-card" style={{ minHeight: 400 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>Loading tickets…</div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ marginBottom: 12 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <p style={{ fontSize: 14 }}>No maintenance tickets {activeTab !== "All" ? `in ${activeTab}` : ""}.</p>
            {!canApprove && (
              <p style={{ fontSize: 12, marginTop: 6 }}>
                Use "Raise Request" to report an issue with one of your assets.
              </p>
            )}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-hover)" }}>
                <th className="org-th">Asset</th>
                <th className="org-th">Issue</th>
                <th className="org-th">Priority</th>
                <th className="org-th">Status</th>
                <th className="org-th">Technician</th>
                <th className="org-th"></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(ticket => (
                <TicketRow key={ticket.id} ticket={ticket} role={role}
                  onUpdate={t => setResolveTicket(t)}
                  onClick={() => {}} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showRaise && (
        <RaiseTicketModal
          myAssets={myAssets}
          onClose={() => setShowRaise(false)}
          onConfirm={handleRaise}
          loading={modalLoading} />
      )}
      {resolveTicket && canApprove && (
        <ResolveModal
          ticket={resolveTicket}
          onClose={() => setResolveTicket(null)}
          onConfirm={handleResolve}
          loading={modalLoading} />
      )}
    </div>
  );
}
