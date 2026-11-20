import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Settings from "./pages/Settings";
import Attendance from "./pages/Attendance";
import Leads from "./pages/Leads";
import WorkLog from "./pages/WorkLog";
import DailyReport from "./pages/DailyReport";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { ROLES } from "./config";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Every page inside here is logged-in only and shares the sidebar */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route
          path="/employees"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <Employees />
            </ProtectedRoute>
          }
        />
        <Route
          path="/attendance"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <Attendance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leads"
          element={
            <ProtectedRoute roles={[ROLES.TELECALLER, ROLES.ADMIN]}>
              <Leads />
            </ProtectedRoute>
          }
        />
        <Route
          path="/work"
          element={
            <ProtectedRoute roles={[ROLES.DIGITAL_MARKETING, ROLES.ADMIN]}>
              <WorkLog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/daily"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <DailyReport />
            </ProtectedRoute>
          }
        />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
