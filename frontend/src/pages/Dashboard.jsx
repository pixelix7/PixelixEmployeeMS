import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import api, { getErrorMessage } from "../api/client";
import { ROLES, ROLE_LABELS } from "../config";
import {
  ArrowRightIcon,
  MegaphoneIcon,
  PhoneIcon,
  CalendarIcon,
  UsersIcon,
  LeaveIcon,
  TaskIcon,
} from "../components/Icons";
import EmployeeOverview from "../components/EmployeeOverview";
import "./Dashboard.css";

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Dashboard() {
  const { user } = useAuth();

  // Telecallers and digital marketing get their own page with its own header
  if (user.role !== ROLES.ADMIN) return <EmployeeOverview user={user} />;

  return (
    <>
      <header className="page-head">
        <h1>Dashboard</h1>
        <p>Welcome back, {user.firstName} — here's your overview</p>
      </header>

      <AdminOverview />
    </>
  );
}

function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get("/users/stats"),
      api.get("/users", { params: { limit: 5 } }),
      api.get("/attendance/daily"),
      api.get("/leaves/summary"),
      api.get("/tasks/summary"),
      api.get("/work-reports/summary"),
    ])
      .then(([statsRes, usersRes, attendanceRes, leaveRes, taskRes, reportRes]) => {
        setStats({
          ...statsRes.data,
          today: attendanceRes.data.summary,
          leave: leaveRes.data,
          tasks: taskRes.data,
          reports: reportRes.data,
        });
        setRecent(usersRes.data.users);
      })
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  const cards = [
    {
      label: "Active Employees",
      value: stats?.total,
      Icon: UsersIcon,
      sub: stats?.inactive ? `${stats.inactive} deactivated` : undefined,
    },
    { label: "Telecallers", value: stats?.byRole.telecaller, Icon: PhoneIcon },
    { label: "Digital Marketing", value: stats?.byRole.digital_marketing, Icon: MegaphoneIcon },
    {
      label: "Present Today",
      value: stats && `${stats.today.present} / ${stats.today.total}`,
      Icon: CalendarIcon,
      to: "/attendance",
      sub: stats?.leave.onLeaveToday ? `${stats.leave.onLeaveToday} on leave today` : undefined,
    },
    {
      label: "Leave Requests",
      value: stats?.leave.pending,
      Icon: LeaveIcon,
      to: "/leaves",
      sub: stats && (stats.leave.pending ? "Waiting for your approval" : "All caught up"),
      highlight: stats?.leave.pending > 0,
    },
    {
      label: "Open Tasks",
      value: stats?.tasks.open,
      Icon: TaskIcon,
      to: stats?.tasks.overdue ? "/tasks?tab=overdue" : "/tasks",
      sub: stats && (stats.tasks.overdue ? `${stats.tasks.overdue} overdue` : `${stats.tasks.doneThisWeek} done this week`),
      highlight: stats?.tasks.overdue > 0,
    },
  ];

  if (error) return <div className="alert">{error}</div>;

  return (
    <>
      {stats?.reports.pending > 0 && (
        <Link to="/work-reports" className="notice dash-reports">
          {stats.reports.pending} work report{stats.reports.pending === 1 ? " is" : "s are"} waiting for your review →
        </Link>
      )}

      <section className="stat-grid stat-grid-admin">
        {cards.map(({ label, value, Icon, to, sub, highlight }) => {
          const body = (
            <>
              <div>
                <p className="stat-label">{label}</p>
                <p className="stat-value">{value ?? <span className="skeleton" />}</p>
                {sub && <p className="stat-sub">{sub}</p>}
              </div>
              <span className="stat-icon">
                <Icon />
              </span>
            </>
          );
          return to ? (
            <Link key={label} to={to} className={`stat-card stat-card-link ${highlight ? "is-alert" : ""}`}>
              {body}
            </Link>
          ) : (
            <article key={label} className="stat-card">
              {body}
            </article>
          );
        })}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Recently added</h2>
          <Link to="/employees" className="panel-link">
            View all <ArrowRightIcon width={16} height={16} />
          </Link>
        </div>

        {!recent ? (
          <p className="panel-empty">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="panel-empty">No users yet.</p>
        ) : (
          <ul className="people">
            {recent.map((u) => (
              <li key={u._id}>
                <Link to={`/employees/${u._id}`} className="person person-link">
                <span className="person-avatar">{u.firstName[0]}</span>
                <div className="person-main">
                  <p className="person-name">
                    {u.firstName} {u.lastName}
                  </p>
                  <p className="person-email">
                    {u.employeeId && <strong className="person-id">{u.employeeId}</strong>}
                    {u.email}
                  </p>
                </div>
                <span className={`role-pill role-${u.role}`}>{ROLE_LABELS[u.role]}</span>
                <span className="person-date">{formatDate(u.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
