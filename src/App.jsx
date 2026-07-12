import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";

function AppRoutes() {
  const { currentUser } = useAuth();
  const [loggedIn, setLoggedIn] = useState(!!currentUser);

  // If Firebase already has a session, jump straight to dashboard
  if (currentUser || loggedIn) {
    return <Dashboard onLogout={() => setLoggedIn(false)} />;
  }

  return <LoginPage onLogin={() => setLoggedIn(true)} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
