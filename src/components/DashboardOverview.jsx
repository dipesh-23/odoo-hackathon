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
        const [
          availableAssets,
          allocatedAssets,
          maintenanceAssets,
          activeBookingsList,
          pendingTransfersList,
          overdueList,
          activeAllocations,
          recentActivityList,
        ] = await Promise.all([
          listAssets({ status: "Available", maxResults: 1000 }),
          listAssets({ status: "Allocated", maxResults: 1000 }),
          listAssets({ status: "UnderMaintenance", maxResults: 1000 }),
          listBookings({ status: "Upcoming", maxResults: 1000 }),
          getPendingTransfers(),
          getOverdueAllocations(),
          getActiveAllocations(),
          getRecentActivity(6),
        ]);

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
    const { action, actorName, metadata } = activity;
    switch (action) {
      case "ASSET_ALLOCATED":
        return `${metadata.assetTag || "Asset"} – allocated to ${
          metadata.holderName || actorName
        }`;
      case "ASSET_RETURNED":
        return `${metadata.assetTag || "Asset"} – returned by ${actorName}`;
      case "BOOKING_CREATED": {
        const start = metadata.startTime?.toDate
          ? metadata.startTime.toDate()
          : metadata.startTime
          ? new Date(metadata.startTime)
          : null;
        const end = metadata.endTime?.toDate
          ? metadata.endTime.toDate()
          : metadata.endTime
          ? new Date(metadata.endTime)
          : null;
        const timeStr =
          start && end
            ? `${start.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })} to ${end.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "";
        return `${metadata.resourceName || "Resource"} – booking confirmed${
          timeStr ? ` – ${timeStr}` : ""
        }`;
      }
      case "TRANSFER_APPROVED":
        return `${metadata.assetTag || "Asset"} – transfer approved to ${
          metadata.to || actorName
        }`;
      case "ASSET_CREATED":
        return `${metadata.assetTag || "Asset"} (${
          metadata.name || ""
        }) – registered`;
      case "MAINTENANCE_RESOLVED":
        return `${metadata.assetTag || "Asset"} – maintenance resolved`;
      default:
        return `${action.replace(/_/g, " ").toLowerCase()} – ${actorName}`;
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
