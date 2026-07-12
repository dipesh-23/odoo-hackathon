import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { listAssets } from "../services/assetService";
import {
  createBooking,
  cancelBooking,
  listBookings,
} from "../services/bookingService";
import { canDirectlyAllocate } from "../utils/rbac";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const STATUS_STYLES = {
  Upcoming:  { bg: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "rgba(139,92,246,0.3)" },
  Ongoing:   { bg: "rgba(16,185,129,0.15)", color: "#34d399", border: "rgba(16,185,129,0.3)" },
  Completed: { bg: "rgba(100,116,139,0.15)", color: "#94a3b8", border: "rgba(100,116,139,0.3)" },
  Cancelled: { bg: "rgba(239,68,68,0.12)", color: "#f87171", border: "rgba(239,68,68,0.3)" },
};
function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.Completed;
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  );
}

// ─── Booking Modal ─────────────────────────────────────────────────────────────
function BookingModal({ resource, onClose, onConfirm, loading, isDeptHead }) {
  const today = new Date().toISOString().slice(0, 16);
  const [form, setForm] = useState({ startTime: "", endTime: "", purpose: "" });
  const valid = form.startTime && form.endTime && form.purpose.trim() &&
                new Date(form.endTime) > new Date(form.startTime);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Book Resource</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{resource.name}</p>
          </div>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="modal-body">
          {isDeptHead && (
            <div className="form-group">
              <p style={{ fontSize: 13, color: "var(--text-muted)", background: "rgba(139,92,246,0.08)",
                border: "1px solid rgba(139,92,246,0.2)", padding: "10px 14px", borderRadius: 8 }}>
                📋 You are booking this resource <strong>on behalf of your department</strong>.
              </p>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Start Date &amp; Time *</label>
            <input id="booking-start" type="datetime-local" className="form-input"
              min={today} value={form.startTime}
              onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">End Date &amp; Time *</label>
            <input id="booking-end" type="datetime-local" className="form-input"
              min={form.startTime || today} value={form.endTime}
              onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            {form.startTime && form.endTime && new Date(form.endTime) <= new Date(form.startTime) && (
              <p style={{ color: "#f87171", fontSize: 12, marginTop: 4 }}>End time must be after start time.</p>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Purpose *</label>
            <textarea id="booking-purpose" className="form-input" rows={3}
              placeholder="Describe the purpose of this booking…"
              style={{ resize: "vertical", fontFamily: "inherit" }}
              value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline modal-cancel" onClick={onClose}>Cancel</button>
          <button id="confirm-booking-btn" className="btn-primary modal-confirm"
            disabled={loading || !valid} onClick={() => onConfirm(form)}>
            {loading ? <span className="spinner" /> : "Confirm Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Resource Card ─────────────────────────────────────────────────────────────
function ResourceCard({ asset, onSelect, isSelected }) {
  return (
    <div onClick={() => onSelect(asset)}
      style={{
        background: isSelected ? "rgba(139,92,246,0.12)" : "var(--surface-card)",
        border: isSelected ? "1.5px solid rgba(139,92,246,0.5)" : "1px solid var(--border-subtle)",
        borderRadius: 14, padding: "18px 20px", cursor: "pointer",
        transition: "all 0.2s", display: "flex", flexDirection: "column", gap: 10,
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>{asset.name}</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{asset.categoryName || "Resource"} · {asset.location || "—"}</p>
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
          background: "rgba(16,185,129,0.12)", color: "#34d399", border: "1px solid rgba(16,185,129,0.25)",
        }}>Bookable</span>
      </div>
    </div>
  );
}

// ─── Booking Row ───────────────────────────────────────────────────────────────
function BookingRow({ booking, onCancel, currentUserId, role }) {
  const canCancel = (booking.bookedByUserId === currentUserId || canDirectlyAllocate(role)) &&
    (booking.status === "Upcoming");
  return (
    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <td className="org-cell" style={{ maxWidth: 200 }}>
        <p style={{ fontWeight: 500 }}>{booking.purpose || "—"}</p>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>by {booking.bookedByName}</p>
      </td>
      <td className="org-cell-muted">{fmtTime(booking.startTime)}</td>
      <td className="org-cell-muted">{fmtTime(booking.endTime)}</td>
      <td className="org-cell"><StatusBadge status={booking.status} /></td>
      <td className="assets-actions-cell">
        {canCancel && (
          <button style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
            color: "#f87171", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer",
          }} onClick={() => onCancel(booking)}>Cancel</button>
        )}
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ResourceBooking() {
  const { currentUser, userProfile } = useAuth();
  const role = userProfile?.role || "Employee";
  const isDeptHead = role === "DepartmentHead";

  const [resources, setResources]           = useState([]);
  const [bookings, setBookings]             = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);
  const [loading, setLoading]               = useState(true);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [modalLoading, setModalLoading]     = useState(false);
  const [showBookModal, setShowBookModal]   = useState(false);
  const [error, setError]                   = useState(null);
  const [bookingFilter, setBookingFilter]   = useState("Upcoming");

  // Load all bookable assets
  const loadResources = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listAssets();
      setResources(all.filter(a => a.isBookable));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  // Load bookings for selected resource
  const loadBookings = useCallback(async (resourceId) => {
    setBookingsLoading(true);
    try {
      const bs = await listBookings({ resourceId });
      setBookings(bs);
    } catch (err) { console.error(err); }
    finally { setBookingsLoading(false); }
  }, []);

  useEffect(() => { loadResources(); }, [loadResources]);
  useEffect(() => {
    if (selectedResource) loadBookings(selectedResource.id);
    else setBookings([]);
  }, [selectedResource, loadBookings]);

  async function handleBook(form) {
    setModalLoading(true);
    try {
      await createBooking({
        resourceId: selectedResource.id,
        resourceName: selectedResource.name,
        bookedByUserId: currentUser.uid,
        bookedByName: userProfile?.name || currentUser.email || "",
        departmentId: userProfile?.departmentId || null,
        startTime: new Date(form.startTime),
        endTime: new Date(form.endTime),
        purpose: form.purpose,
      }, { uid: currentUser.uid, name: userProfile?.name || currentUser.email || "" });
      setShowBookModal(false);
      await loadBookings(selectedResource.id);
    } catch (err) { alert(err.message); }
    finally { setModalLoading(false); }
  }

  async function handleCancel(booking) {
    if (!window.confirm("Cancel this booking?")) return;
    setModalLoading(true);
    try {
      await cancelBooking(booking.id, { uid: currentUser.uid, name: userProfile?.name || currentUser.email || "" });
      await loadBookings(selectedResource.id);
    } catch (err) { alert(err.message); }
    finally { setModalLoading(false); }
  }

  const filteredBookings = bookingFilter === "All"
    ? bookings
    : bookings.filter(b => b.status === bookingFilter);

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
          <h1 className="org-title">Resource Booking</h1>
          <p className="org-subtitle">
            {loading ? "Loading…" : `${resources.length} shared resource${resources.length !== 1 ? "s" : ""} available`}
          </p>
        </div>
        {selectedResource && (
          <button id="book-resource-btn" className="org-add-btn" onClick={() => setShowBookModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              <line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" />
            </svg>
            Book {selectedResource.name}
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, height: "calc(100vh - 200px)" }}>

        {/* Resources List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", paddingRight: 4 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading resources…</div>
          ) : resources.length === 0 ? (
            <div style={{
              background: "var(--surface-card)", border: "1px solid var(--border-subtle)",
              borderRadius: 14, padding: 32, textAlign: "center",
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" style={{ marginBottom: 12 }}>
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No shared resources available.</p>
              <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 6 }}>
                Mark assets as "Bookable" in the Assets directory.
              </p>
            </div>
          ) : (
            resources.map(r => (
              <ResourceCard key={r.id} asset={r}
                isSelected={selectedResource?.id === r.id}
                onSelect={setSelectedResource} />
            ))
          )}
        </div>

        {/* Bookings Panel */}
        <div style={{
          background: "var(--surface-card)", border: "1px solid var(--border-subtle)",
          borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {!selectedResource ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              height: "100%", gap: 16, color: "var(--text-muted)" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p style={{ fontSize: 15, fontWeight: 500 }}>Select a resource to view its bookings</p>
            </div>
          ) : (
            <>
              {/* Panel header */}
              <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-subtle)",
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                    {selectedResource.name}
                  </h3>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    {selectedResource.location || "No location"} · {selectedResource.categoryName || "Resource"}
                  </p>
                </div>
                {/* Status filter */}
                <div style={{ display: "flex", gap: 6 }}>
                  {["Upcoming", "Ongoing", "Completed", "All"].map(f => (
                    <button key={f} onClick={() => setBookingFilter(f)}
                      style={{
                        padding: "5px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                        fontWeight: bookingFilter === f ? 600 : 400,
                        background: bookingFilter === f ? "rgba(139,92,246,0.15)" : "transparent",
                        color: bookingFilter === f ? "#a78bfa" : "var(--text-muted)",
                        border: bookingFilter === f ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
                        transition: "all 0.15s",
                      }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bookings table */}
              <div style={{ overflowY: "auto", flex: 1 }}>
                {bookingsLoading ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading bookings…</div>
                ) : filteredBookings.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                    No {bookingFilter !== "All" ? bookingFilter.toLowerCase() : ""} bookings for this resource.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-hover)" }}>
                        <th className="org-th" style={{ paddingLeft: 24 }}>Purpose / Booked By</th>
                        <th className="org-th">Start</th>
                        <th className="org-th">End</th>
                        <th className="org-th">Status</th>
                        <th className="org-th"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBookings.map(b => (
                        <BookingRow key={b.id} booking={b}
                          onCancel={handleCancel}
                          currentUserId={currentUser?.uid}
                          role={role} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Booking Modal */}
      {showBookModal && selectedResource && (
        <BookingModal
          resource={selectedResource}
          isDeptHead={isDeptHead}
          onClose={() => setShowBookModal(false)}
          onConfirm={handleBook}
          loading={modalLoading} />
      )}
    </div>
  );
}
