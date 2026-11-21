import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Settings from "./pages/Settings";
import Attendance from "./pages/Attendance";
import Leads from "./pages/Leads";
import WorkLog from "./pages/WorkLog";
import DailyReport from "./pages/DailyReport";
import EmployeeProfile from "./pages/EmployeeProfile";
import Leaves from "./pages/Leaves";
import Announcements from "./pages/Announcements";
import Tasks from "./pages/Tasks";
import Reports from "./pages/Reports";
import Clients from "./pages/Clients";
import Salaries from "./pages/Salaries";
import WorkReports from "./pages/WorkReports";
import Projects from "./pages/Projects";
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
          path="/employees/:id"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <EmployeeProfile />
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
          path="/reports"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <Reports />
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
        <Route path="/clients" element={<Clients />} />
        <Route
          path="/salaries"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN]}>
              <Salaries />
            </ProtectedRoute>
          }
        />
        <Route path="/projects" element={<Projects />} />
        <Route path="/work-reports" element={<WorkReports />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/leaves" element={<Leaves />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
