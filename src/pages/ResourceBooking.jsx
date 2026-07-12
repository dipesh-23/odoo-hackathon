import React, { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { createBooking, deleteBooking } from "../services/bookingService";

export default function ResourceBooking() {
  const { currentUser } = useAuth();
  const [assets, setAssets] = useState([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [bookings, setBookings] = useState([]);
  
  // Selection state
  const [selectionStart, setSelectionStart] = useState(null); // hour (e.g. 9)
  const [selectionEnd, setSelectionEnd] = useState(null); // hour (e.g. 10)
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);

  // Fetch assets
  const fetchAssets = async () => {
    try {
      const q = query(collection(db, "assets"), where("isBookable", "==", true));
      const snap = await getDocs(q);
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAssets(fetched);
      if (fetched.length > 0 && !selectedAssetId) {
        setSelectedAssetId(fetched[0].id);
      }
    } catch (err) {
      console.error("Error fetching assets:", err);
      setErrorMsg("Failed to load resources.");
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  // Real-time listener for bookings
  useEffect(() => {
    if (!selectedAssetId || !selectedDate) return;

    // Build the date range for the selected day
    const startOfDay = new Date(`${selectedDate}T00:00:00`);
    const endOfDay = new Date(`${selectedDate}T23:59:59`);

    const q = query(
      collection(db, "bookings"),
      where("resourceId", "==", selectedAssetId),
      where("status", "in", ["Upcoming", "Ongoing", "Completed"]),
      where("startTime", ">=", startOfDay),
      where("startTime", "<=", endOfDay)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const fetchedBookings = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          startTime: data.startTime?.toDate ? data.startTime.toDate() : new Date(data.startTime),
          endTime: data.endTime?.toDate ? data.endTime.toDate() : new Date(data.endTime),
        };
      });
      // Also filter out cancelled ones just in case
      setBookings(fetchedBookings.filter(b => b.status !== "Cancelled"));
    }, (error) => {
      console.error("Realtime booking listener error:", error);
    });

    return () => unsubscribe();
  }, [selectedAssetId, selectedDate]);

  // Handle Temp Seeding
  const handleSeedAssets = async () => {
    try {
      const sample1 = doc(collection(db, "assets"));
      await setDoc(sample1, {
        name: "Conference Room Alpha",
        isBookable: true,
        status: "Available",
        operatingHours: { start: 9, end: 18 },
      });
      const sample2 = doc(collection(db, "assets"));
      await setDoc(sample2, {
        name: "Company Vehicle - Van",
        isBookable: true,
        status: "Available",
        operatingHours: { start: 7, end: 20 },
      });
      fetchAssets();
      setToastMsg("Sample assets seeded!");
      setTimeout(() => setToastMsg(""), 3000);
    } catch (err) {
      console.error("Failed to seed:", err);
      setErrorMsg("Failed to seed assets");
    }
  };

  const selectedAsset = assets.find(a => a.id === selectedAssetId);
  const opStart = selectedAsset?.operatingHours?.start ?? 9;
  const opEnd = selectedAsset?.operatingHours?.end ?? 18;
  const hours = Array.from({ length: opEnd - opStart }, (_, i) => opStart + i);

  // Helper to convert hour to Date object on the selected date
  const getDateForHour = (hour) => {
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  // Helper to format hour (e.g. 9 -> "9:00 AM")
  const formatHour = (hour) => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  // Client-side conflict check
  const candidateConflict = useMemo(() => {
    if (selectionStart === null || selectionEnd === null) return false;
    let s = selectionStart;
    let e = selectionEnd;
    
    // Swap if reverse selected
    if (e <= s) {
      return "invalid_range";
    }

    const startTime = getDateForHour(s);
    const endTime = getDateForHour(e);

    const hasConflict = bookings.some(b => b.startTime < endTime && b.endTime > startTime);
    return hasConflict ? "conflict" : "clear";
  }, [selectionStart, selectionEnd, bookings, selectedDate]);

  // Drag to select logic
  useEffect(() => {
    const handleMouseUp = () => setIsDraggingSelection(false);
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const handleMouseDown = (hour) => {
    const startObj = getDateForHour(hour);
    const endObj = getDateForHour(hour + 1);
    const isBooked = bookings.some(b => b.startTime < endObj && b.endTime > startObj);

    if (selectionStart === null) {
      if (isBooked) return;
      setSelectionStart(hour);
      setSelectionEnd(hour + 1);
      setIsDraggingSelection(true);
    } else {
      // If clicking the start of a 1-hour selection, deselect it
      if (hour === selectionStart && selectionEnd === hour + 1) {
        handleClearSelection();
        return;
      }
      
      // Otherwise, start a fresh drag selection
      if (isBooked) return;
      setSelectionStart(hour);
      setSelectionEnd(hour + 1);
      setIsDraggingSelection(true);
    }
  };

  const handleMouseEnter = (hour) => {
    if (!isDraggingSelection || selectionStart === null) return;
    
    // Only allow dragging down (expanding time)
    if (hour >= selectionStart) {
      setSelectionEnd(hour + 1);
    }
  };

  const handleClearSelection = () => {
    setSelectionStart(null);
    setSelectionEnd(null);
    setErrorMsg("");
  };

  const handleBookSlot = async () => {
    if (candidateConflict !== "clear") return;
    if (!selectedAssetId) return;

    setIsSubmitting(true);
    setErrorMsg("");
    
    const startObj = getDateForHour(selectionStart);
    const endObj = getDateForHour(selectionEnd);
    
    try {
      await createBooking({
        resourceId: selectedAsset.id,
        resourceName: selectedAsset.name,
        bookedByUserId: currentUser.uid,
        bookedByName: currentUser.displayName || currentUser.email || "User",
        startTime: startObj,
        endTime: endObj,
        purpose: "Resource Booking"
      }, { uid: currentUser.uid, name: currentUser.displayName || currentUser.email });
      
      setToastMsg("Booking confirmed!");
      setTimeout(() => setToastMsg(""), 3000);
      handleClearSelection();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to book slot");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBooking = async (e, bookingId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this booking?")) return;
    try {
      await deleteBooking(bookingId);
      setToastMsg("Booking deleted!");
      setTimeout(() => setToastMsg(""), 3000);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to delete booking");
      setTimeout(() => setErrorMsg(""), 3000);
    }
  };

  // Compute "Ongoing", "Upcoming", "Completed" visually without saving to DB
  const getVisualStatus = (b) => {
    const now = new Date();
    if (now > b.endTime) return "Completed";
    if (now >= b.startTime && now <= b.endTime) return "Ongoing";
    return "Upcoming";
  };

  return (
    <div className="resource-booking-container">
      <div className="booking-header">
        <div className="controls-row">
          <div className="control-group">
            <label>Resource</label>
            <select 
              value={selectedAssetId} 
              onChange={e => {
                setSelectedAssetId(e.target.value);
                handleClearSelection();
              }}
            >
              {assets.length === 0 && <option value="">No resources found</option>}
              {assets.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          
          <div className="control-group">
            <label>Date</label>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={e => {
                setSelectedDate(e.target.value);
                handleClearSelection();
              }} 
            />
          </div>
        </div>

        {assets.length === 0 && (
          <button className="seed-btn" onClick={handleSeedAssets}>Seed Sample Assets</button>
        )}
      </div>

      <div className="booking-legend">
        <div className="legend-item"><div className="legend-dot empty"></div><span>Empty Slot</span></div>
        <div className="legend-item"><div className="legend-dot booked"></div><span>Booked</span></div>
        <div className="legend-item"><div className="legend-dot available"></div><span>Valid Candidate</span></div>
        <div className="legend-item"><div className="legend-dot conflict"></div><span>Conflict</span></div>
      </div>

      {toastMsg && <div className="toast success-toast">{toastMsg}</div>}
      {errorMsg && <div className="toast error-toast">{errorMsg}</div>}

      <div className="booking-grid-wrapper">
        <div className="booking-grid" style={{ position: 'relative', marginTop: '20px' }}>
          {hours.map(hour => {
            return (
              <div 
                key={hour} 
                className="grid-row" 
                onMouseDown={() => handleMouseDown(hour)}
                onMouseEnter={() => handleMouseEnter(hour)}
                style={{ userSelect: 'none' }}
              >
                <div className="time-label">{formatHour(hour)}</div>
                <div className="grid-cell"></div>
              </div>
            );
          })}
          
          {/* Render existing bookings */}
          {bookings.map(b => {
            const sh = b.startTime.getHours() + (b.startTime.getMinutes()/60);
            const eh = b.endTime.getHours() + (b.endTime.getMinutes()/60);
            
            // Only render if within our operating hours
            if (eh <= opStart || sh >= opEnd) return null;
            
            const clampedStart = Math.max(sh, opStart);
            const clampedEnd = Math.min(eh, opEnd);
            
            const top = (clampedStart - opStart) * 60; // 60px per hour
            const height = (clampedEnd - clampedStart) * 60;
            
            const vStatus = getVisualStatus(b);
            
            return (
              <div 
                key={b.id} 
                className={`booking-block existing-booking status-${vStatus.toLowerCase()}`}
                style={{ top: `${top}px`, height: `${height}px` }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="booking-title">{b.bookedByName}</span>
                    <span className="booking-time">{formatHour(b.startTime.getHours())} - {formatHour(b.endTime.getHours())}</span>
                  </div>
                  {b.bookedByUserId === currentUser.uid && (
                    <button 
                      onClick={(e) => handleDeleteBooking(e, b.id)}
                      className="booking-delete-btn"
                      title="Delete Booking"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Render candidate selection */}
          {selectionStart !== null && selectionEnd !== null && (
            (() => {
              const top = (selectionStart - opStart) * 60;
              const height = (selectionEnd - selectionStart) * 60;
              
              if (height <= 0) return null; // Invalid reverse selection handled via state
              
              const isConflict = candidateConflict === "conflict";
              
              return (
                <div 
                  className={`booking-block candidate-booking ${isConflict ? 'conflict' : 'clear'}`}
                  style={{ top: `${top}px`, height: `${height}px` }}
                >
                  {isConflict ? (
                    <span className="conflict-text">
                      Requested {formatHour(selectionStart)} to {formatHour(selectionEnd)} – conflict – slot is unavailable
                    </span>
                  ) : (
                    <span className="clear-text">
                      Requested {formatHour(selectionStart)} to {formatHour(selectionEnd)} (Unconfirmed)
                    </span>
                  )}
                </div>
              );
            })()
          )}
        </div>
      </div>

      <div className="booking-footer">
        <div className="status-line" style={{ marginRight: 'auto', fontWeight: '500' }}>
          {candidateConflict === "invalid_range" && <span style={{color: 'var(--error)'}}>End time must be after start time.</span>}
          {candidateConflict === "conflict" && <span style={{color: 'var(--error)'}}>Conflict: Slot is unavailable.</span>}
          {candidateConflict === "clear" && selectionStart !== null && <span style={{color: 'var(--success)'}}>Valid slot selected.</span>}
        </div>
        <button 
          className="book-submit-btn" 
          disabled={selectionStart === null || candidateConflict !== "clear" || isSubmitting}
          onClick={handleBookSlot}
        >
          {isSubmitting ? "Booking..." : "Book a slot"}
        </button>
        {selectionStart !== null && (
          <button className="book-cancel-btn" onClick={handleClearSelection}>Cancel</button>
        )}
      </div>
    </div>
  );
}
