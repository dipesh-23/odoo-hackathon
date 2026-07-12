import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listAssets,
  createAsset,
  updateAsset,
  getAssetHistory,
} from "../services/assetService";
import { getActiveCategories } from "../services/categoryService";
import { getActiveDepartments } from "../services/departmentService";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { canRegisterAsset, canEditAsset, canDeleteAsset } from "../utils/rbac";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  Available:        { cls: "asset-status-available",   label: "Available" },
  Allocated:        { cls: "asset-status-allocated",   label: "Allocated" },
  UnderMaintenance: { cls: "asset-status-maintenance", label: "Under Maintenance" },
  Reserved:         { cls: "asset-status-reserved",    label: "Reserved" },
  Lost:             { cls: "asset-status-lost",        label: "Lost" },
  Retired:          { cls: "asset-status-retired",     label: "Retired" },
  Disposed:         { cls: "asset-status-disposed",    label: "Disposed" },
};
const ALL_STATUSES = Object.keys(STATUS_STYLES);
const CONDITIONS   = ["New", "Good", "Fair", "Poor", "Damaged"];

const COLS = [
  { key: "assetTag",      label: "Tag" },
  { key: "name",          label: "Name" },
  { key: "categoryName",  label: "Category" },
  { key: "status",        label: "Status" },
  { key: "location",      label: "Location" },
  { key: "departmentName",label: "Department" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sortAssets(assets, col, dir) {
  if (!col) return assets;
  return [...assets].sort((a, b) => {
    const va = (a[col] || "").toString().toLowerCase();
    const vb = (b[col] || "").toString().toLowerCase();
    return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  });
}

function useDebounce(value, delay) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function fmt(ts) {
  if (!ts) return "—";
  if (ts.toDate) return ts.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  if (ts instanceof Date) return ts.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return String(ts);
}

// ─── Close Icon ───────────────────────────────────────────────────────────────
const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ─── Filter Pill ──────────────────────────────────────────────────────────────
function FilterPill({ label, value, options, onChange, onClear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="filter-pill-wrap" ref={ref}>
      <button className={`filter-pill ${value ? "filter-pill-active" : ""}`} onClick={() => setOpen(v => !v)}>
        <span>{label}{value ? `: ${value}` : ""}</span>
        {value ? (
          <span className="filter-pill-clear" onClick={e => { e.stopPropagation(); onClear(); }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>
      {open && (
        <div className="filter-dropdown">
          <button className="filter-dropdown-item filter-clear-all" onClick={() => { onClear(); setOpen(false); }}>All {label}s</button>
          {options.map(opt => (
            <button key={opt} className={`filter-dropdown-item ${value === opt ? "filter-dropdown-active" : ""}`}
              onClick={() => { onChange(opt); setOpen(false); }}>{opt}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Three-dot Action Menu ────────────────────────────────────────────────────
// role-gated: edit = Admin|AssetManager, delete = Admin only
function ActionMenu({ asset, role, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const allowEdit   = canEditAsset(role);
  const allowDelete = canDeleteAsset(role);

  // No actions available for this role — hide the menu entirely
  if (!allowEdit && !allowDelete) return null;

  return (
    <div className="action-menu-wrap" ref={ref}>
      <button id={`action-btn-${asset.id}`} className="action-dots-btn"
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }} title="Actions">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="action-menu-dropdown">
          {allowEdit && (
            <button className="action-menu-item" onClick={e => { e.stopPropagation(); setOpen(false); onEdit(asset); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit Asset
            </button>
          )}
          {allowEdit && allowDelete && <div className="action-menu-separator" />}
          {allowDelete && (
            <button className="action-menu-item action-menu-danger" onClick={e => { e.stopPropagation(); setOpen(false); onDelete(asset); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Register / Edit Modal ────────────────────────────────────────────────────
function AssetModal({ mode, asset, categories, departments, onClose, onSave, loading }) {
  const isEdit = mode === "edit";

  const blank = {
    name: "", categoryId: "", categoryName: "",
    serialNumber: "", acquisitionDate: "", acquisitionCost: "",
    condition: "New", location: "", isBookable: false,
    nextServiceDueDate: "", retirementThresholdYears: "", documentUrls: "",
  };

  const [form, setForm] = useState(isEdit ? {
    name:            asset.name            || "",
    categoryId:      asset.categoryId      || "",
    categoryName:    asset.categoryName    || "",
    serialNumber:    asset.serialNumber    || "",
    acquisitionDate: asset.acquisitionDate
      ? (asset.acquisitionDate.toDate
          ? asset.acquisitionDate.toDate().toISOString().split("T")[0]
          : String(asset.acquisitionDate))
      : "",
    acquisitionCost: asset.acquisitionCost || "",
    condition:       asset.condition       || "New",
    location:        asset.location        || "",
    isBookable:      asset.isBookable      || false,
    status:          asset.status          || "Available",
    nextServiceDueDate: asset.nextServiceDueDate
      ? (asset.nextServiceDueDate.toDate
          ? asset.nextServiceDueDate.toDate().toISOString().split("T")[0]
          : String(asset.nextServiceDueDate))
      : "",
    retirementThresholdYears: asset.retirementThresholdYears || "",
    documentUrls: asset.documentUrls ? asset.documentUrls.join(', ') : "",
  } : blank);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCat = (e) => {
    const cat = categories.find(c => c.id === e.target.value);
    setForm(f => ({ ...f, categoryId: e.target.value, categoryName: cat?.name || "" }));
  };

  const valid = form.name.trim() && form.categoryId;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card asset-modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? "Edit Asset" : "Register New Asset"}</h2>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>

        <div className="modal-body asset-modal-scroll">
          <div className="asset-modal-grid">

            {/* Name */}
            <div className="form-group asset-modal-full">
              <label className="form-label">Asset Name *</label>
              <input id="asset-name-input" className="form-input" placeholder="e.g. Dell Latitude 5540"
                value={form.name} onChange={e => set("name", e.target.value)} />
            </div>

            {/* Category */}
            <div className="form-group">
              <label className="form-label">Category *</label>
              <select id="asset-category-select" className="form-input form-select" value={form.categoryId} onChange={handleCat}>
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Serial */}
            <div className="form-group">
              <label className="form-label">Serial Number</label>
              <input id="asset-serial-input" className="form-input" placeholder="e.g. SN-123456"
                value={form.serialNumber} onChange={e => set("serialNumber", e.target.value)} />
            </div>

            {/* Acquisition Date */}
            <div className="form-group">
              <label className="form-label">Acquisition Date</label>
              <input id="asset-acq-date-input" className="form-input" type="date"
                value={form.acquisitionDate} onChange={e => set("acquisitionDate", e.target.value)} />
            </div>

            {/* Acquisition Cost */}
            <div className="form-group">
              <label className="form-label">Acquisition Cost (₹)</label>
              <input id="asset-cost-input" className="form-input" type="number" placeholder="0.00"
                value={form.acquisitionCost} onChange={e => set("acquisitionCost", e.target.value)} />
            </div>

            {/* Condition */}
            <div className="form-group">
              <label className="form-label">Condition</label>
              <select id="asset-condition-select" className="form-input form-select"
                value={form.condition} onChange={e => set("condition", e.target.value)}>
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Location */}
            <div className="form-group">
              <label className="form-label">Location</label>
              <input id="asset-location-input" className="form-input" placeholder="e.g. Head Office – Floor 2"
                value={form.location} onChange={e => set("location", e.target.value)} />
            </div>

            {/* Status (edit only) */}
            {isEdit && (
              <div className="form-group">
                <label className="form-label">Status</label>
                <select id="asset-status-select" className="form-input form-select"
                  value={form.status} onChange={e => set("status", e.target.value)}>
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_STYLES[s].label}</option>)}
                </select>
              </div>
            )}

            {/* Bookable */}
            <div className="form-group">
              <label className="form-label">Shared / Bookable</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className={`status-toggle-btn ${form.isBookable ? "active" : ""}`}
                  onClick={() => set("isBookable", true)}>Yes</button>
                <button type="button" className={`status-toggle-btn ${!form.isBookable ? "active" : ""}`}
                  onClick={() => set("isBookable", false)}>No</button>
              </div>
            </div>

            {/* Photo URL placeholder */}
            <div className="form-group asset-modal-full">
              <label className="form-label">Photo URL <span className="form-label-hint">(paste link or leave blank)</span></label>
              <input id="asset-photo-input" className="form-input" placeholder="https://…"
                value={form.photoUrl || ""} onChange={e => set("photoUrl", e.target.value)} />
            </div>

            {/* Next Service Due Date */}
            <div className="form-group">
              <label className="form-label">Next Service Due Date</label>
              <input id="asset-next-service-input" className="form-input" type="date"
                value={form.nextServiceDueDate} onChange={e => set("nextServiceDueDate", e.target.value)} />
            </div>

            {/* Retirement Threshold */}
            <div className="form-group">
              <label className="form-label">Retirement Threshold (Years)</label>
              <input id="asset-retirement-input" className="form-input" type="number" placeholder="e.g. 5"
                value={form.retirementThresholdYears} onChange={e => set("retirementThresholdYears", e.target.value)} />
            </div>

            {/* Document URLs */}
            <div className="form-group asset-modal-full">
              <label className="form-label">Document URLs <span className="form-label-hint">(comma-separated)</span></label>
              <input id="asset-documents-input" className="form-input" placeholder="e.g. https://doc1.com, https://doc2.com"
                value={form.documentUrls} onChange={e => set("documentUrls", e.target.value)} />
            </div>

          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-outline modal-cancel" onClick={onClose}>Cancel</button>
          <button id="asset-modal-confirm" className="btn-primary modal-confirm"
            disabled={loading || !valid} onClick={() => onSave(form)}>
            {loading ? <span className="spinner" /> : isEdit ? "Save Changes" : "Register Asset"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({ asset, onClose, onConfirm, loading }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Delete Asset</h2>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="modal-body">
          <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.7 }}>
            Are you sure you want to delete <strong style={{ color: "var(--text-primary)" }}>{asset.name}</strong>{" "}
            <span style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>({asset.assetTag})</span>?
            This action cannot be undone.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn-outline modal-cancel" onClick={onClose}>Cancel</button>
          <button id="confirm-delete-asset" className="btn-primary modal-confirm asset-delete-confirm"
            disabled={loading} onClick={onConfirm}>
            {loading ? <span className="spinner" /> : "Delete Asset"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Asset Detail Side Panel ──────────────────────────────────────────────────
function AssetDetailPanel({ asset, onClose, onEdit }) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [activeTab, setActiveTab] = useState("info");

  useEffect(() => {
    setLoadingHistory(true);
    getAssetHistory(asset.id)
      .then(setHistory)
      .catch(console.warn)
      .finally(() => setLoadingHistory(false));
  }, [asset.id]);

  const statusInfo = STATUS_STYLES[asset.status] || { cls: "asset-status-available", label: asset.status };

  return (
    <>
      {/* Backdrop */}
      <div className="detail-panel-backdrop" onClick={onClose} />
      {/* Panel */}
      <aside className="detail-panel">
        {/* Header */}
        <div className="detail-panel-header">
          <div className="detail-panel-title-row">
            <div>
              <h2 className="detail-panel-name">{asset.name}</h2>
              <span className="detail-panel-tag">{asset.assetTag}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="detail-panel-edit-btn" onClick={() => onEdit(asset)} title="Edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button className="modal-close" onClick={onClose} title="Close"><CloseIcon /></button>
            </div>
          </div>
          <div className="detail-panel-badges">
            <span className={`asset-status-pill ${statusInfo.cls}`}>{statusInfo.label}</span>
            {asset.isBookable && <span className="asset-bookable-badge">Bookable</span>}
            <span className="detail-panel-condition-badge">{asset.condition || "—"}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="detail-panel-tabs">
          {["info", "history"].map(t => (
            <button key={t} className={`detail-panel-tab ${activeTab === t ? "active" : ""}`}
              onClick={() => setActiveTab(t)}>
              {t === "info" ? "Asset Info" : "History"}
              {t === "history" && !loadingHistory && history.length > 0 && (
                <span className="detail-tab-count">{history.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="detail-panel-body">
          {activeTab === "info" && (
            <div className="detail-info-content">

              {/* Quick meta strip */}
              <div className="detail-meta-strip">
                <div className="detail-meta-item">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  {asset.location || "No location"}
                </div>
                <div className="detail-meta-item">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                  {asset.categoryName || "No category"}
                </div>
                {asset.departmentName && (
                  <div className="detail-meta-item">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22V18h6v4" /><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01" /></svg>
                    {asset.departmentName}
                  </div>
                )}
              </div>

              {/* Fields grid */}
              <div className="detail-fields-section">
                <p className="detail-fields-heading">Identification</p>
                <div className="detail-fields-grid">
                  <DetailField label="Asset Tag"     value={<span style={{ fontFamily: "monospace", color: "#a78bfa" }}>{asset.assetTag}</span>} />
                  <DetailField label="Serial Number" value={asset.serialNumber} />
                  <DetailField label="Category"      value={asset.categoryName} />
                  <DetailField label="Condition"     value={asset.condition} />
                </div>
              </div>

              <div className="detail-fields-section">
                <p className="detail-fields-heading">Acquisition</p>
                <div className="detail-fields-grid">
                  <DetailField label="Acquisition Date" value={fmt(asset.acquisitionDate)} />
                  <DetailField label="Acquisition Cost" value={asset.acquisitionCost ? `₹${Number(asset.acquisitionCost).toLocaleString("en-IN")}` : undefined} />
                  <DetailField label="Retirement Threshold" value={asset.retirementThresholdYears ? `${asset.retirementThresholdYears} years` : undefined} />
                </div>
              </div>

              <div className="detail-fields-section">
                <p className="detail-fields-heading">Current Assignment</p>
                <div className="detail-fields-grid">
                  <DetailField label="Holder"      value={asset.currentHolderName} fallback="Unallocated" />
                  <DetailField label="Holder Type" value={asset.currentHolderType} />
                  <DetailField label="Department"  value={asset.departmentName} />
                  <DetailField label="Bookable"    value={asset.isBookable ? "Yes" : "No"} />
                </div>
              </div>

              {asset.photoUrl && (
                <div className="detail-fields-section">
                  <p className="detail-fields-heading">Photo</p>
                  <img src={asset.photoUrl} alt={asset.name}
                    className="detail-asset-photo"
                    onError={e => { e.target.style.display = "none"; }} />
                </div>
              )}

              {asset.qrCodeUrl && (
                <div className="detail-fields-section">
                  <p className="detail-fields-heading">QR Code</p>
                  <div className="detail-qr-wrap">
                    <img src={asset.qrCodeUrl} alt={`QR for ${asset.assetTag}`} className="detail-qr-img" />
                    <span className="detail-qr-label">{asset.assetTag}</span>
                  </div>
                </div>
              )}

              {asset.documentUrls && asset.documentUrls.length > 0 && (
                <div className="detail-fields-section">
                  <p className="detail-fields-heading">Documents</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {asset.documentUrls.map((url, idx) => (
                      <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="detail-doc-link" style={{ color: "#a78bfa", textDecoration: "underline", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Document {idx + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="detail-fields-section">
                <p className="detail-fields-heading">System</p>
                <div className="detail-fields-grid">
                  <DetailField label="Created"     value={fmt(asset.createdAt)} />
                  <DetailField label="Last Updated" value={fmt(asset.updatedAt)} />
                  <DetailField label="Next Service" value={fmt(asset.nextServiceDueDate)} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="detail-history-content">
              {loadingHistory ? (
                <div className="assets-loading-state"><span className="spinner" /><p>Loading history…</p></div>
              ) : history.length === 0 ? (
                <div className="assets-empty-state" style={{ padding: "40px 20px" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  <p>No history yet</p>
                  <span>Events will appear here after allocation, transfer, or maintenance</span>
                </div>
              ) : (
                <div className="asset-history-list">
                  {history.map(ev => (
                    <div key={ev.id} className="asset-history-item">
                      <div className={`asset-history-dot history-dot-${(ev.type || "").toLowerCase()}`} />
                      <div className="asset-history-content">
                        <p className="asset-history-desc">{ev.description}</p>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span className="history-type-badge">{ev.type}</span>
                          <span className="asset-history-meta">{fmt(ev.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function DetailField({ label, value, fallback = "—" }) {
  return (
    <div className="detail-field">
      <span className="asset-detail-label">{label}</span>
      <span className="asset-detail-value">{value || fallback}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AssetsDirectory() {
  const { currentUser, userProfile } = useAuth();
  const role = userProfile?.role || "Employee";

  // Data
  const [allAssets,    setAllAssets]    = useState([]);
  const [categories,   setCategories]   = useState([]);
  const [departments,  setDepartments]  = useState([]);
  const [loadingData,  setLoadingData]  = useState(true);
  const [dataError,    setDataError]    = useState(null);

  // Filters / search / sort
  const [searchRaw,        setSearchRaw]        = useState("");
  const search                                   = useDebounce(searchRaw, 180);
  const [filterCategory,   setFilterCategory]   = useState("");
  const [filterStatus,     setFilterStatus]     = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterLocation,   setFilterLocation]   = useState("");
  const [sortCol,          setSortCol]          = useState(null);
  const [sortDir,          setSortDir]          = useState("asc");

  // Modals / panel
  const [showRegister, setShowRegister] = useState(false);
  const [editAsset,    setEditAsset]    = useState(null);
  const [deleteAsset,  setDeleteAsset]  = useState(null);
  const [viewAsset,    setViewAsset]    = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoadingData(true);
    setDataError(null);
    try {
      const [assets, cats, depts] = await Promise.all([
        listAssets({ maxResults: 500 }),
        getActiveCategories(),
        getActiveDepartments(),
      ]);
      setAllAssets(assets);
      setCategories(cats);
      setDepartments(depts);
    } catch (err) {
      console.error(err);
      setDataError("Failed to load assets. Check Firestore connection.");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Dynamic filter options ────────────────────────────────────────────────
  const categoryOptions   = [...new Set(allAssets.map(a => a.categoryName).filter(Boolean))].sort();
  const departmentOptions = [...new Set(allAssets.map(a => a.departmentName).filter(Boolean))].sort();
  const locationOptions   = [...new Set(allAssets.map(a => a.location).filter(Boolean))].sort();

  // ── Filtered + sorted rows ────────────────────────────────────────────────
  const filtered = (() => {
    let r = allAssets;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(a =>
        (a.assetTag     || "").toLowerCase().includes(q) ||
        (a.serialNumber || "").toLowerCase().includes(q) ||
        (a.name         || "").toLowerCase().includes(q)
      );
    }
    if (filterCategory)   r = r.filter(a => a.categoryName   === filterCategory);
    if (filterStatus)     r = r.filter(a => a.status         === filterStatus);
    if (filterDepartment) r = r.filter(a => a.departmentName === filterDepartment);
    if (filterLocation)   r = r.filter(a => a.location       === filterLocation);
    return sortAssets(r, sortCol, sortDir);
  })();

  const anyFilter = search || filterCategory || filterStatus || filterDepartment || filterLocation;

  // ── Sort ──────────────────────────────────────────────────────────────────
  function handleSort(key) {
    if (sortCol !== key) { setSortCol(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortCol(null); setSortDir("asc"); }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const actor = () => ({ uid: currentUser.uid, name: userProfile?.name || currentUser.email });

  async function handleRegister(form) {
    setModalLoading(true);
    try {
      const dataToSave = {
        ...form,
        acquisitionCost: Number(form.acquisitionCost) || 0,
        acquisitionDate: form.acquisitionDate ? new Date(form.acquisitionDate) : null,
        nextServiceDueDate: form.nextServiceDueDate ? new Date(form.nextServiceDueDate) : null,
        retirementThresholdYears: form.retirementThresholdYears ? Number(form.retirementThresholdYears) : null,
        documentUrls: form.documentUrls ? form.documentUrls.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      await createAsset(dataToSave, actor());
      setShowRegister(false);
      await loadData();
    } catch (err) { alert("Failed to register asset: " + err.message); }
    finally { setModalLoading(false); }
  }

  async function handleEdit(form) {
    setModalLoading(true);
    try {
      const dataToSave = {
        ...form,
        acquisitionCost: Number(form.acquisitionCost) || 0,
        acquisitionDate: form.acquisitionDate ? new Date(form.acquisitionDate) : null,
        nextServiceDueDate: form.nextServiceDueDate ? new Date(form.nextServiceDueDate) : null,
        retirementThresholdYears: form.retirementThresholdYears ? Number(form.retirementThresholdYears) : null,
        documentUrls: form.documentUrls ? form.documentUrls.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      await updateAsset(editAsset.id, dataToSave, actor());
      // Refresh viewAsset if it's open for this asset
      if (viewAsset?.id === editAsset.id) {
        setViewAsset(a => ({ ...a, ...dataToSave }));
      }
      setEditAsset(null);
      await loadData();
    } catch (err) { alert("Failed to update: " + err.message); }
    finally { setModalLoading(false); }
  }

  async function handleDelete() {
    setModalLoading(true);
    try {
      await deleteDoc(doc(db, "assets", deleteAsset.id));
      if (viewAsset?.id === deleteAsset.id) setViewAsset(null);
      setDeleteAsset(null);
      await loadData();
    } catch (err) { alert("Failed to delete: " + err.message); }
    finally { setModalLoading(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`assets-page ${viewAsset ? "assets-page-panel-open" : ""}`}>

      {/* Header */}
      <div className="org-header">
        <div>
          <h1 className="org-title">Assets Directory</h1>
          <p className="org-subtitle">
            {loadingData ? "Loading…" : `${allAssets.length} registered · ${filtered.length} shown`}
          </p>
        </div>
        {canRegisterAsset(role) && (
          <button id="register-asset-btn" className="org-add-btn" onClick={() => setShowRegister(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Register Asset
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="assets-toolbar">
        <div className="assets-search-wrap">
          <svg className="assets-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input id="assets-search-input" className="form-input assets-search-input"
            placeholder="Search by tag, serial, name…"
            value={searchRaw} onChange={e => setSearchRaw(e.target.value)} />
          {searchRaw && (
            <button className="assets-search-clear" onClick={() => setSearchRaw("")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="assets-filters">
          <FilterPill label="Category"   value={filterCategory}   options={categoryOptions}   onChange={setFilterCategory}   onClear={() => setFilterCategory("")} />
          <FilterPill label="Status"     value={filterStatus}     options={ALL_STATUSES}       onChange={setFilterStatus}     onClear={() => setFilterStatus("")} />
          <FilterPill label="Department" value={filterDepartment} options={departmentOptions}  onChange={setFilterDepartment} onClear={() => setFilterDepartment("")} />
          <FilterPill label="Location"   value={filterLocation}   options={locationOptions}    onChange={setFilterLocation}   onClear={() => setFilterLocation("")} />
          {anyFilter && (
            <button className="assets-clear-all" onClick={() => {
              setFilterCategory(""); setFilterStatus(""); setFilterDepartment("");
              setFilterLocation(""); setSearchRaw("");
            }}>Clear all</button>
          )}
        </div>
      </div>

      {/* Table card */}
      <div className="org-content-card assets-table-card">
        {dataError ? (
          <div className="assets-empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <p>{dataError}</p>
            <button className="org-add-btn" style={{ marginTop: 8 }} onClick={loadData}>Retry</button>
          </div>
        ) : loadingData ? (
          <div className="assets-loading-state">
            <span className="spinner" />
            <p>Loading assets…</p>
          </div>
        ) : (
          <div className="org-table-wrap">
            <table className="org-table assets-table">
              <thead>
                <tr>
                  {COLS.map(col => (
                    <th key={col.key} className="assets-th-sortable" onClick={() => handleSort(col.key)}>
                      <span className="assets-th-inner">
                        {col.label}
                        <span className={`sort-icon ${sortCol === col.key ? "sort-icon-active" : ""}`}>
                          {sortCol === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅"}
                        </span>
                      </span>
                    </th>
                  ))}
                  <th className="assets-th-actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="assets-empty-row">
                      <div className="assets-empty-state">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                        <p>No assets found</p>
                        <span>Try adjusting your search or filters</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map(asset => {
                    const si = STATUS_STYLES[asset.status] || STATUS_STYLES.Available;
                    const isSelected = viewAsset?.id === asset.id;
                    return (
                      <tr key={asset.id}
                        className={`assets-row ${isSelected ? "assets-row-selected" : ""}`}
                        onClick={() => setViewAsset(isSelected ? null : asset)}>
                        <td className="org-cell-name assets-tag-cell">{asset.assetTag}</td>
                        <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>{asset.name}</td>
                        <td className="org-cell-muted">{asset.categoryName || "—"}</td>
                        <td><span className={`asset-status-pill ${si.cls}`}>{si.label}</span></td>
                        <td className="org-cell-muted">{asset.location || "—"}</td>
                        <td className="org-cell-muted">{asset.departmentName || "—"}</td>
                        <td className="assets-actions-cell" onClick={e => e.stopPropagation()}>
                          <ActionMenu asset={asset} role={role}
                            onEdit={a => { setEditAsset(a); }}
                            onDelete={a => setDeleteAsset(a)} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <div className="org-table-footer">
              <p className="org-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Click a row to open details · Click headers to sort
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {viewAsset && (
        <AssetDetailPanel asset={viewAsset} onClose={() => setViewAsset(null)}
          onEdit={a => { setEditAsset(a); }} />
      )}

      {/* Modals — gated by role */}
      {showRegister && canRegisterAsset(role) && (
        <AssetModal mode="register" categories={categories} departments={departments}
          onClose={() => setShowRegister(false)} onSave={handleRegister} loading={modalLoading} />
      )}
      {editAsset && canEditAsset(role) && (
        <AssetModal mode="edit" asset={editAsset} categories={categories} departments={departments}
          onClose={() => setEditAsset(null)} onSave={handleEdit} loading={modalLoading} />
      )}
      {deleteAsset && (
        <DeleteConfirmModal asset={deleteAsset}
          onClose={() => setDeleteAsset(null)} onConfirm={handleDelete} loading={modalLoading} />
      )}
    </div>
  );
}
