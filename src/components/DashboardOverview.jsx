import { useEffect, useState } from "react";
import { listAssets } from "../services/assetService";
import { listBookings } from "../services/bookingService";
import { getPendingTransfers, getOverdueAllocations, getActiveAllocations } from "../services/allocationService";
import { getRecentActivity } from "../services/activityLogService";

export default function DashboardOverview({ onNavigate }) {
  const [metrics, setMetrics] = useState({
    available: 0,
    allocated: 0,
    maintenance: 0,
    activeBookings: 0,
    pendingTransfers: 0,
    upcomingReturns: 0,
  });
  const [overdueCount, setOverdueCount] = useState(0);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const results = await Promise.allSettled([
          listAssets({ status: "Available", maxResults: 1000 }),
          listAssets({ status: "Allocated", maxResults: 1000 }),
          listAssets({ status: "UnderMaintenance", maxResults: 1000 }),
          listBookings({ status: "Upcoming", maxResults: 1000 }),
          getPendingTransfers(),
          getOverdueAllocations(),
          getActiveAllocations(),
          getRecentActivity(6),
        ]);

        const safeData = results.map(r => r.status === 'fulfilled' ? r.value : []);

        const [
          availableAssets,
          allocatedAssets,
          maintenanceAssets,
          activeBookingsList,
          pendingTransfersList,
          overdueList,
          activeAllocations,
          recentActivityList,
        ] = safeData;

        const upcomingReturnsCount = activeAllocations.filter((a) => {
          if (!a.expectedReturnDate) return false;
          const exp = a.expectedReturnDate.toDate
            ? a.expectedReturnDate.toDate()
            : new Date(a.expectedReturnDate);
          return exp > new Date();
        }).length;

        setMetrics({
          available: availableAssets.length,
          allocated: allocatedAssets.length,
          maintenance: maintenanceAssets.length,
          activeBookings: activeBookingsList.length,
          pendingTransfers: pendingTransfersList.length,
          upcomingReturns: upcomingReturnsCount,
        });

        setOverdueCount(overdueList.length);
        setActivities(recentActivityList);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const formatActivity = (activity) => {
    const { action, actorName, metadata = {} } = activity;
    const assetNamePart = metadata.assetName || metadata.categoryName || "Asset";
    const assetTagPart = metadata.assetTag || "Unknown";
    
    switch (action) {
      case "ASSET_ALLOCATED":
        return `${assetNamePart} ${assetTagPart} – allocated to ${
          metadata.holderName || actorName
        }${metadata.departmentName ? ` – ${metadata.departmentName}` : ""}`;
      case "ASSET_RETURNED":
        return `${assetNamePart} ${assetTagPart} – returned by ${actorName}`;
      case "BOOKING_CREATED": {
        const start = metadata.startTime?.toDate ? metadata.startTime.toDate() : (metadata.startTime ? new Date(metadata.startTime) : null);
        const end = metadata.endTime?.toDate ? metadata.endTime.toDate() : (metadata.endTime ? new Date(metadata.endTime) : null);
        let timeStr = "";
        if (start && end) {
          const sTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          const eTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          timeStr = ` – ${sTime} to ${eTime}`;
        }
        return `${metadata.resourceName || "Resource"} – booking confirmed${timeStr}`;
      }
      case "TRANSFER_APPROVED":
        return `Transfer approved: ${assetTagPart} to ${metadata.departmentName || metadata.to || actorName}`;
      case "ASSET_CREATED":
        return `New asset registered: ${assetTagPart}`;
      case "AUDIT_CLOSED": {
        const flagged = (metadata.missingCount || 0) + (metadata.damagedCount || 0);
        const scope = metadata.scopeValue || "Audit";
        return `${scope} closed – ${flagged} ${flagged === 1 ? "asset" : "assets"} flagged`;
      }
      case "OVERDUE_RETURN_FLAGGED":
        return `${assetTagPart} flagged overdue`;
      case "MAINTENANCE_RAISED":
        return `New maintenance request raised for ${assetTagPart}`;
      case "MAINTENANCE_APPROVED":
        return `Maintenance request ${assetTagPart} approved`;
      default: {
        if (action && action.startsWith("MAINTENANCE_")) {
          const status = (action.split("_")[1] || "").toLowerCase();
          let statusText = status;
          if (status === "technicianassigned") statusText = "technician assigned";
          else if (status === "inprogress") statusText = "in progress";
          return `${assetNamePart} ${assetTagPart} – maintenance ${statusText}`;
        }
        return `${(action || "").replace(/_/g, " ").toLowerCase()} – ${actorName}`;
      }
    }
  };

  const metricCards = [
    { title: "Available", value: metrics.available },
    { title: "Allocated", value: metrics.allocated },
    { title: "Under Maintenance", value: metrics.maintenance },
    { title: "Active Bookings", value: metrics.activeBookings },
    { title: "Pending Transfers", value: metrics.pendingTransfers },
    { title: "Upcoming Returns", value: metrics.upcomingReturns },
  ];

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-spinner" />
        <span>Loading overview…</span>
      </div>
    );
  }

  return (
    <div className="dashboard-overview">
      {/* Header */}
      <h2 className="dashboard-section-title">Today's Overview</h2>

      {/* Metric Cards Grid */}
      <div className="dashboard-metrics-grid">
        {metricCards.map((card, i) => (
          <div key={i} className="dashboard-metric-card">
            <div className="dashboard-metric-label">{card.title}</div>
            <div className="dashboard-metric-value">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Overdue Alert */}
      {overdueCount > 0 && (
        <div className="dashboard-alert">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          {overdueCount} {overdueCount === 1 ? "asset" : "assets"} overdue for
          return – flagged for follow-up
        </div>
      )}

      {/* Quick Action Buttons */}
      <div className="dashboard-actions">
        <button
          className="dashboard-action-btn dashboard-action-btn--primary"
          onClick={() => onNavigate("assets")}
        >
          + register asset
        </button>
        <button
          className="dashboard-action-btn"
          onClick={() => onNavigate("resource-booking")}
        >
          Book resource
        </button>
        <button
          className="dashboard-action-btn"
          onClick={() => onNavigate("maintenance")}
        >
          Raise requests
        </button>
      </div>

      {/* Recent Activity */}
      <div className="dashboard-activity">
        <h3 className="dashboard-activity-title">Recent Activity</h3>
        <div className="dashboard-activity-list">
          {activities.length === 0 ? (
            <span className="dashboard-activity-empty">
              No recent activity logged.
            </span>
          ) : (
            activities.map((a) => (
              <div key={a.id} className="dashboard-activity-item">
                {formatActivity(a)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
