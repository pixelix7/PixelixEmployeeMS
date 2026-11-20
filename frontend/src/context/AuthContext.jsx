import { useCallback, useEffect, useState } from "react";
import api, { TOKEN_KEY } from "../api/client";
import { ROLES } from "../config";
import { AuthContext } from "./useAuth";

// Which roles may sign in through each portal
const PORTAL_ROLES = {
  admin: [ROLES.ADMIN],
  employee: [ROLES.TELECALLER, ROLES.DIGITAL_MARKETING],
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Only show a loading state if there's a saved session to restore
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  // Restore the session on page load
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    api
      .get("/auth/me")
      .then(({ data }) => setUser(data.user))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  // The API client fires this when a token is rejected
  useEffect(() => {
    window.addEventListener("auth:logout", logout);
    return () => window.removeEventListener("auth:logout", logout);
  }, [logout]);

  const login = async (email, password, portal) => {
    const { data } = await api.post("/auth/login", { email, password });

    if (!PORTAL_ROLES[portal]?.includes(data.user.role)) {
      const correct = data.user.role === ROLES.ADMIN ? "Admin" : "Employee";
      throw new Error(`This account can't sign in here. Please use the ${correct} Portal.`);
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
