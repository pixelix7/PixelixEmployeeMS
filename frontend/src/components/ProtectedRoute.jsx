import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

// Shows children only to logged-in users, optionally limited to some roles
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="page-loader">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;

  return children;
}
