
import { useState } from "react";
import Login from "./Login";
import Dashboard from "./Dashboard";
import { logoutUser } from "./services/api";

function App() {
  const [role, setRole] = useState<string | null>(() => {
    const token = localStorage.getItem("token");
    const savedRole = localStorage.getItem("role");

    return token ? savedRole : null;
  });

  const handleLoginSuccess = (userRole: string) => {
    setRole(userRole);
  };

  const handleLogout = () => {
    logoutUser();
    setRole(null);
  };

  if (!role) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <Dashboard
      role={role}
      onLogout={handleLogout}
    />
  );
}

export default App;
