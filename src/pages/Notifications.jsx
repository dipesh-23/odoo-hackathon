import React, { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { markAllAsRead } from "../services/notificationService";

const TABS = ["All", "Alerts", "Approvals", "Bookings"];

// Helper to format "2m ago"
function timeAgo(date) {
  if (!date) return "Just now";
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Notifications() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("All");
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(Date.now()); // For force-updating relative time

  // Force re-render every minute to update relative timestamps
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    
    setIsLoading(true);
    
    const constraints = [
      where("userId", "==", currentUser.uid),
    ];
    
    // Map plural tabs to exact category names
    let categoryFilter = null;
    if (activeTab === "Alerts") categoryFilter = "Alert";
    else if (activeTab === "Approvals") categoryFilter = "Approval";
    else if (activeTab === "Bookings") categoryFilter = "Booking";

    if (categoryFilter) {
      constraints.push(where("category", "==", categoryFilter));
    }
    
    const q = query(collection(db, "notifications"), ...constraints);
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Sort client-side to avoid requiring multiple composite indexes in Firestore
      notifs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
        return timeB - timeA;
      });
      
      setNotifications(notifs);
      setIsLoading(false);
    }, (error) => {
      console.error("Notifications listener error:", error);
      setIsLoading(false);
    });

    // Cleanup previous listener on unmount or tab switch
    return () => unsubscribe();
  }, [currentUser, activeTab]);

  const handleMarkAsRead = async (id, e) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, "notifications", id), {
        isRead: true
      });
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!currentUser) return;
    try {
      // This uses the batch write function from the service
      await markAllAsRead(currentUser.uid);
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  const hasUnread = notifications.some(n => !n.isRead);

  return (
    <div className="notifications-container">
      <div className="notifications-header">
        <h3 className="section-title">Notifications</h3>
        {hasUnread && (
          <button className="btn-secondary" onClick={handleMarkAllAsRead} style={{ fontSize: '13px', padding: '6px 12px' }}>
            Mark all as read
          </button>
        )}
      </div>

      <div className="tabs-row">
        {TABS.map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="notifications-list">
        {isLoading ? (
          <div className="loading-state">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="report-empty-state">
            <div className="report-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div className="report-empty-title">No notifications yet</div>
            <div className="report-empty-subtitle">When actions occur, they'll appear here.</div>
          </div>
        ) : (
          notifications.map(notif => {
            const dateStr = notif.createdAt?.toDate ? timeAgo(notif.createdAt.toDate()) : "Just now";
            return (
              <div 
                key={notif.id} 
                className={`notification-row ${notif.isRead ? "read" : "unread"}`}
                onClick={(e) => !notif.isRead && handleMarkAsRead(notif.id, e)}
              >
                <div className="notification-indicator">
                  {!notif.isRead && <div className="unread-dot"></div>}
                </div>
                <div className="notification-content">
                  <div className="notification-message">
                    {notif.message || notif.title}
                  </div>
                </div>
                <div className="notification-time">
                  {dateStr}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
