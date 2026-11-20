import { useCallback, useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { ROLES, ROLE_LABELS } from "../config";
import { formatClock, formatDay, formatDuration, formatTime, todayLabel } from "../utils/format";
import { liveMinutes, useNow } from "../utils/attendance";
import { AlarmIcon, CalendarIcon, ClockIcon, LoginIcon, LogoutIcon } from "./Icons";
import { CheckOutCell, WorkedCell } from "./AttendanceCells";
import TodayFollowUps from "./TodayFollowUps";
import TodayWork from "./TodayWork";
import StatusPill from "./StatusPill";
import "./AttendanceTable.css";
import "./EmployeeOverview.css";

// Dashboard for telecallers and digital marketing staff
export default function EmployeeOverview({ user }) {
  const [today, setToday] = useState(undefined); // undefined = loading, null = not clocked in
  const [month, setMonth] = useState(null);
  const [policy, setPolicy] = useState(null); // office start / late cutoff from the server
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      Promise.all([api.get("/attendance/today"), api.get("/attendance/me", { params: { limit: 7 } })])
        .then(([todayRes, monthRes]) => {
          setToday(todayRes.data.record);
          setPolicy(todayRes.data.policy);
          setMonth(monthRes.data);
          setError("");
        })
        .catch((err) => setError(getErrorMessage(err))),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  // One clock for the whole page so the card and table always agree
  const now = useNow(Boolean(today?.activeSince));

  const summary = month?.summary;
  const cards = [
    { label: "Days Present", sub: "This month", value: summary?.daysPresent, Icon: CalendarIcon },
    { label: "Late Arrivals", sub: "This month", value: summary?.lateArrivals, Icon: AlarmIcon },
    {
      label: "Avg. Work Hours",
      sub: "Completed days",
      value: summary && formatDuration(summary.avgWorkMinutes),
      Icon: ClockIcon,
    },
  ];

  return (
    <>
      <header className="page-head">
        <h1>Welcome, {user.firstName}!</h1>
        <p>
          {ROLE_LABELS[user.role]} · {todayLabel()}
        </p>
      </header>

      {user.role === ROLES.TELECALLER && <TodayFollowUps />}
      {user.role === ROLES.DIGITAL_MARKETING && <TodayWork />}

      {error && <div className="alert eo-error">{error}</div>}

      <section className="stat-grid stat-grid-3">
        {cards.map(({ label, sub, value, Icon }) => (
          <article key={label} className="stat-card">
            <div>
              <p className="stat-label">{label}</p>
              <p className="stat-value">{value ?? <span className="skeleton" />}</p>
              <p className="stat-sub">{sub}</p>
            </div>
            <span className="stat-icon">
              <Icon />
            </span>
          </article>
        ))}
      </section>

      <ClockCard record={today} now={now} policy={policy} onChanged={load} />

      <section className="panel">
        <div className="panel-head">
          <h2>Recent attendance</h2>
        </div>
        {!month ? (
          <p className="panel-empty">Loading…</p>
        ) : month.records.length === 0 ? (
          <p className="panel-empty">No attendance this month yet. Clock in to get started.</p>
        ) : (
          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th>Worked</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {month.records.map((r) => (
                  <tr key={r._id}>
                    <td className="att-date">{formatDay(r.date)}</td>
                    <td>{formatTime(r.checkIn)}</td>
                    <td>
                      <CheckOutCell record={r} />
                    </td>
                    <td>
                      <WorkedCell record={r} now={now} />
                    </td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// "Office starts at 9:30 am. You have a 15-minute grace period — clocking in after 9:45 am marks you late."
const policyText = (policy) => {
  if (!policy) return "";
  const late = formatClock(policy.lateAfter);
  if (policy.officeStart && policy.graceMinutes) {
    return `Office starts at ${formatClock(policy.officeStart)}. You have a ${policy.graceMinutes}-minute grace period — clocking in after ${late} marks you late.`;
  }
  return `Clocking in after ${late} marks you late.`;
};

function ClockCard({ record, now, policy, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = Boolean(record?.activeSince);

  const act = async (action) => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/attendance/${action}`);
      await onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const clockInButton = (label, hint) => (
    <button type="button" className="clock-btn" onClick={() => act("clock-in")} disabled={busy}>
      <LoginIcon width={20} height={20} />
      <span>
        <strong>{busy ? "Clocking in…" : label}</strong>
        <small>{hint}</small>
      </span>
    </button>
  );

  let title, detail, button;
  if (record === undefined) {
    title = "Loading today…";
    detail = "";
  } else if (!record) {
    title = "You haven't clocked in yet";
    detail = "Start your work day when you're ready.";
    button = clockInButton("Clock In", "Start your work day");
  } else if (working) {
    const late = record.status === "late" ? " (late)" : "";
    title = `Working · ${formatDuration(liveMinutes(record, now))} today`;
    detail =
      record.sessionCount > 1
        ? `Session ${record.sessionCount} started at ${formatTime(record.activeSince)} · first in at ${formatTime(record.checkIn)}${late}`
        : `Clocked in at ${formatTime(record.checkIn)}${late}`;
    button = (
      <button
        type="button"
        className="clock-btn is-out"
        onClick={() => act("clock-out")}
        disabled={busy}
      >
        <LogoutIcon width={20} height={20} />
        <span>
          <strong>{busy ? "Clocking out…" : "Clock Out"}</strong>
          <small>Pause or end your day</small>
        </span>
      </button>
    );
  } else {
    // Clocked out: today's total so far, and they can start another session
    const sessions = record.sessionCount > 1 ? ` across ${record.sessionCount} sessions` : "";
    title = `Clocked out · ${formatDuration(record.workMinutes)} today`;
    detail = `Last clock-out at ${formatTime(record.checkOut)}${sessions}. Clock in again to add more time to today.`;
    button = clockInButton("Clock In Again", "Resume your work day");
  }

  return (
    <section className={`clock-card ${working ? "is-working" : ""}`}>
      <div className="clock-info">
        <p className="clock-eyebrow">
          {working && <span className="clock-dot" />}
          Today
        </p>
        <h2>{title}</h2>
        {detail && <p className="clock-detail">{detail}</p>}
        {error && <p className="clock-error">{error}</p>}
        {policy && (
          <p className="clock-policy">
            <ClockIcon width={14} height={14} />
            {policyText(policy)}
          </p>
        )}
      </div>
      {button}
    </section>
  );
}
