import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import SpotlightCard from "../components/SpotlightCard";

// Maps Firebase error codes to friendly messages
const getFriendlyError = (code) => {
  const map = {
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/email-already-in-use": "This email is already registered. Try logging in.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/invalid-credential": "Invalid email or password.",
  };
  return map[code] || "Something went wrong. Please try again.";
};

export default function LoginPage({ onLogin }) {
  const { login, signup, resetPassword } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const clearMessages = () => {
    setError("");
    setSuccessMsg("");
  };

  const switchMode = (newMode) => {
    clearMessages();
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setMode(newMode);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearMessages();

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        await login(email, password);
        onLogin();
      } else if (mode === "signup") {
        await signup(email, password);
        onLogin();
      } else if (mode === "reset") {
        await resetPassword(email);
        setSuccessMsg("Password reset email sent! Check your inbox.");
      }
    } catch (err) {
      setError(getFriendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === "login";
  const isReset = mode === "reset";
  const isSignup = mode === "signup";

  return (
    <div className="login-bg">
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

      <SpotlightCard className="login-card">
        {/* Top Header Bar */}
        <div className="login-card-header-bar">
          AssetFlow – {isReset ? "reset" : isLogin ? "login" : "signup"}
        </div>

        {/* Content Container */}
        <div className="login-card-content">
          {/* Logo */}
          <div className="login-header-logo-container">
            <div className="af-logo">
              <span>AF</span>
            </div>
          </div>

          {/* Error / Success Banner */}
          {error && (
            <div className="alert alert-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}
          {successMsg && (
            <div className="alert alert-success" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {successMsg}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="form-group">
              <label htmlFor="email-input" className="form-label">Email</label>
              <input
                id="email-input"
                type="email"
                className="form-input"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {!isReset && (
              <>
                <div className="form-group">
                  <label htmlFor="password-input" className="form-label">Password</label>
                  <div className="password-wrapper">
                    <input
                      id="password-input"
                      type={showPassword ? "text" : "password"}
                      className="form-input"
                      placeholder="••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete={isLogin ? "current-password" : "new-password"}
                    />
                    <button
                      type="button"
                      id="toggle-password-btn"
                      className="password-toggle"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                  {isLogin && (
                    <button
                      type="button"
                      id="forgot-password-btn"
                      className="forgot-link"
                      onClick={() => switchMode("reset")}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>

                {isSignup && (
                  <div className="form-group">
                    <label htmlFor="confirm-password-input" className="form-label">Confirm Password</label>
                    <div className="password-wrapper">
                      <input
                        id="confirm-password-input"
                        type={showPassword ? "text" : "password"}
                        className="form-input"
                        placeholder="••••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* In Signup/Reset mode, show submit button at bottom of form */}
            {!isLogin && (
              <button
                id="submit-btn"
                type="submit"
                className="btn-primary"
                disabled={loading}
              >
                {loading ? (
                  <span className="spinner" />
                ) : isReset ? (
                  "Send Reset Email"
                ) : (
                  "Create Account"
                )}
              </button>
            )}
          </form>

          {/* Divider + Footer */}
          <div className="login-footer">
            <div className="divider" />
            {isReset ? (
              <p className="footer-text">
                Remember your password?{" "}
                <button id="back-to-login-btn" className="footer-link" onClick={() => switchMode("login")}>
                  Back to Sign In
                </button>
              </p>
            ) : isLogin ? (
              <div className="new-here-box">
                <p className="new-here-label">New here?</p>
                <div className="info-card-box">
                  <p className="new-here-desc">
                    Sign up creates an employee account — admin roles assigned later.
                  </p>
                </div>
                <button
                  id="create-account-btn"
                  type="button"
                  className="btn-outline"
                  onClick={() => switchMode("signup")}
                >
                  Create Account
                </button>
              </div>
            ) : (
              <p className="footer-text">
                Already have an account?{" "}
                <button id="go-to-login-btn" className="footer-link" onClick={() => switchMode("login")}>
                  Sign In
                </button>
              </p>
            )}
          </div>
        </div>
      </SpotlightCard>
    </div>
  );
}
