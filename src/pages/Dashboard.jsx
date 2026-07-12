import { useAuth } from "../context/AuthContext";
import SpotlightCard from "../components/SpotlightCard";

export default function Dashboard({ onLogout }) {
  const { currentUser, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <div className="dashboard-bg">
      {/* Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="background-video"
      >
        <source src="https://storage.googleapis.com/gweb-gemini-cdn/gemini/uploads/89e9004d716a7803fc7c9aab18c985af783f5a36.mp4" type="video/mp4" />
      </video>

      {/* Grid Overlay */}
      <div className="background-overlay" />

      {/* Aurora blobs */}
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />

      <SpotlightCard className="dashboard-card">
        <div className="dashboard-header">
          <div className="af-logo">
            <span>AF</span>
          </div>
          <div>
            <h1 className="dashboard-title">Welcome to AssetFlow</h1>
            <p className="dashboard-email">{currentUser?.email}</p>
          </div>
        </div>

        <div className="dashboard-body">
          <div className="status-badge">
            <span className="status-dot" />
            Authenticated
          </div>
          <p className="dashboard-hint">
            Your dashboard is being set up. More features coming soon.
          </p>
        </div>

        <button id="logout-btn" className="btn-outline" onClick={handleLogout}>
          Sign Out
        </button>
      </SpotlightCard>
    </div>
  );
}
