import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { ROLE_LABELS } from "../config";
import Modal from "../components/Modal";
import StatusPill from "../components/StatusPill";
import { CheckOutCell, WorkedCell } from "../components/AttendanceCells";
import { useNow } from "../utils/attendance";
import {
  AlarmIcon,
  CalendarIcon,
  ClockIcon,
  DownloadIcon,
  SearchIcon,
  UsersIcon,
} from "../components/Icons";
import {
  formatDay,
  formatDuration,
  formatLongDay,
  formatMonth,
  formatTime,
  todayKey,
} from "../utils/format";
import "./Dashboard.css";
import "./Employees.css";
import "../components/AttendanceTable.css";
import "./Attendance.css";

// Admin view of everyone's attendance: one day, or a month summary
export default function Attendance() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "monthly" ? "monthly" : "daily";
  const today = todayKey();
  const date = params.get("date") || today;
  const month = params.get("month") || today.slice(0, 7);
  const [search, setSearch] = useState("");

  const update = (changes) => setParams({ view, date, month, ...changes }, { replace: true });

  return (
    <>
      <header className="att-head">
        <div className="page-head">
          <h1>Attendance</h1>
          <p>Track daily check-ins and monthly summaries</p>
        </div>
        <div className="att-tabs" role="tablist">
          {["daily", "monthly"].map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={view === v ? "is-active" : ""}
              onClick={() => update({ view: v })}
            >
              {v === "daily" ? "Daily" : "Monthly"}
            </button>
          ))}
        </div>
      </header>

      <div className="att-toolbar">
        {view === "daily" ? (
          <div className="att-picker">
            <input
              type="date"
              className="input"
              value={date}
              max={today}
              onChange={(e) => e.target.value && update({ date: e.target.value })}
              aria-label="Date"
            />
            {date !== today && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => update({ date: today })}
              >
                Today
              </button>
            )}
          </div>
        ) : (
          <div className="att-picker">
            <input
              type="month"
              className="input"
              value={month}
              max={today.slice(0, 7)}
              onChange={(e) => e.target.value && update({ month: e.target.value })}
              aria-label="Month"
            />
            <ExportButton month={month} />
          </div>
        )}
        <div className="emp-search att-search">
          <SearchIcon />
          <input
            className="input"
            type="search"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search employees"
          />
        </div>
      </div>

      {view === "daily" ? (
        <DailyView date={date} search={search} />
      ) : (
        <MonthlyView month={month} search={search} />
      )}
    </>
  );
}

const matches = (user, search) => {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(q);
};

// Fetches `url` whenever it changes. `loading` is derived, not stored.
function useReport(url) {
  const [result, setResult] = useState({ url: null, data: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    api
      .get(url)
      .then(({ data }) => !cancelled && setResult({ url, data, error: "" }))
      .catch((err) => !cancelled && setResult({ url, data: null, error: getErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { ...result, loading: result.url !== url };
}


function StatCards({ cards }) {
  return (
    <section className="stat-grid">
      {cards.map(({ label, value, sub, Icon }) => (
        <article key={label} className="stat-card">
          <div>
            <p className="stat-label">{label}</p>
            <p className="stat-value">{value ?? <span className="skeleton" />}</p>
            {sub && <p className="stat-sub">{sub}</p>}
          </div>
          <span className="stat-icon">
            <Icon />
          </span>
        </article>
      ))}
    </section>
  );
}

function Person({ user }) {
  return (
    <div className="att-person">
      <span className="person-avatar">
        {user.firstName[0]}
        {user.lastName[0]}
      </span>
      <div className="person-main">
        <p className="person-name">
          {user.firstName} {user.lastName}
        </p>
        <p className="person-email">{ROLE_LABELS[user.role]}</p>
      </div>
    </div>
  );
}

/* ---------------- Daily ---------------- */

function DailyView({ date, search }) {
  const { data, error, loading } = useReport(`/attendance/daily?date=${date}`);
  const now = useNow(Boolean(data?.summary.working));
  const s = data?.summary;
  const isToday = data?.isToday;

  const cards = [
    { label: "Present", value: s && `${s.present} / ${s.total}`, sub: "Clocked in", Icon: UsersIcon },
    { label: "Late", value: s?.late, sub: "After start time", Icon: AlarmIcon },
    isToday
      ? { label: "Not In Yet", value: s?.notIn, sub: "No check-in so far", Icon: CalendarIcon }
      : { label: "Absent", value: s?.absent, sub: "No check-in", Icon: CalendarIcon },
    { label: "Still Working", value: s?.working, sub: "Not clocked out", Icon: ClockIcon },
  ];

  const rows = data?.rows.filter((r) => matches(r.user, search)) ?? [];

  return (
    <>
      {error && <div className="alert att-alert">{error}</div>}
      <StatCards cards={data && !loading ? cards : cards.map((c) => ({ ...c, value: undefined }))} />

      {data && !data.isWorkDay && (
        <div className="notice notice-success att-alert">
          {formatLongDay(date)} is not a work day, so nobody is marked absent.
        </div>
      )}

      <section className={`panel ${loading && data ? "is-refreshing" : ""}`}>
        <div className="panel-head">
          <h2>{data ? formatLongDay(data.date) : "Loading…"}</h2>
        </div>
        {!data ? (
          <p className="panel-empty">{loading ? "Loading…" : "No data."}</p>
        ) : rows.length === 0 ? (
          <p className="panel-empty">
            {data.rows.length === 0 ? "No staff had joined by this date." : "No employees match your search."}
          </p>
        ) : (
          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th>Worked</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ user, record, status }) => {
                  return (
                    <tr key={user._id}>
                      <td>
                        <Person user={user} />
                      </td>
                      <td>{record ? formatTime(record.checkIn) : "—"}</td>
                      <td>
                        <CheckOutCell record={record} />
                      </td>
                      <td>
                        <WorkedCell record={record} now={now} />
                      </td>
                      <td>
                        <StatusPill status={status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/* ---------------- Monthly ---------------- */

function MonthlyView({ month, search }) {
  const { data, error, loading } = useReport(`/attendance/monthly?month=${month}`);
  const [selected, setSelected] = useState(null);
  const s = data?.summary;

  const cards = [
    { label: "Present Days", value: s?.present, sub: "Late days included", Icon: UsersIcon },
    { label: "Late Days", value: s?.late, sub: "After start time", Icon: AlarmIcon },
    { label: "Absent Days", value: s?.absent, sub: "Missed work days", Icon: CalendarIcon },
    { label: "Working Hours", value: s && formatDuration(s.workMinutes), sub: "Team total", Icon: ClockIcon },
  ];

  const rows = data?.rows.filter((r) => matches(r.user, search)) ?? [];

  return (
    <>
      {error && <div className="alert att-alert">{error}</div>}
      <StatCards cards={data && !loading ? cards : cards.map((c) => ({ ...c, value: undefined }))} />

      <section className={`panel ${loading && data ? "is-refreshing" : ""}`}>
        <div className="panel-head">
          <h2>{data ? formatMonth(data.month) : "Loading…"}</h2>
          {data && <span className="att-meta">{data.workingDays} work days so far</span>}
        </div>
        {!data ? (
          <p className="panel-empty">{loading ? "Loading…" : "No data."}</p>
        ) : rows.length === 0 ? (
          <p className="panel-empty">
            {data.rows.length === 0 ? "No staff had joined by this month." : "No employees match your search."}
          </p>
        ) : (
          <div className="att-table-wrap">
            <table className="att-table att-table-clickable">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="num">Present</th>
                  <th className="num">Late</th>
                  <th className="num">Absent</th>
                  <th className="num">Working hours</th>
                  <th className="num">Avg / day</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.user._id}
                    tabIndex={0}
                    onClick={() => setSelected(r.user)}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(r.user)}
                    title="View day-by-day"
                  >
                    <td>
                      <Person user={r.user} />
                    </td>
                    <td className="num">{r.present}</td>
                    <td className="num">{r.late}</td>
                    <td className="num">{r.absent}</td>
                    <td className="num">{formatDuration(r.workMinutes)}</td>
                    <td className="num">{formatDuration(r.avgWorkMinutes)}</td>
                    <td>
                      <RateBar rate={r.attendanceRate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="form-hint att-footnote">
        Present includes late days. Absent counts finished work days with no check-in since the
        employee joined. Click a row to see each day.
      </p>

      {selected && (
        <EmployeeMonthModal user={selected} month={month} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function RateBar({ rate }) {
  if (rate == null) return <span className="att-muted">—</span>;
  const level = rate >= 90 ? "good" : rate >= 70 ? "ok" : "low";
  return (
    <div className="rate">
      <div className="rate-track">
        <div className={`rate-fill rate-${level}`} style={{ width: `${rate}%` }} />
      </div>
      <span>{rate}%</span>
    </div>
  );
}

function EmployeeMonthModal({ user, month, onClose }) {
  const { data, error, loading } = useReport(`/attendance/user/${user._id}?month=${month}`);
  const now = useNow(Boolean(data?.days.some((d) => d.record?.activeSince)));
  const s = data?.summary;

  return (
    <Modal
      title={`${user.firstName} ${user.lastName}`}
      subtitle={`${ROLE_LABELS[user.role]} · ${formatMonth(month)}`}
      onClose={onClose}
    >
      {error && <div className="alert">{error}</div>}
      {loading && !data ? (
        <div className="emp-loading">
          <div className="spinner" />
        </div>
      ) : (
        data && (
          <>
            <div className="att-chips">
              <span>
                <strong>{s.present}</strong> present
              </span>
              <span>
                <strong>{s.late}</strong> late
              </span>
              <span>
                <strong>{s.absent}</strong> absent
              </span>
              <span>
                <strong>{formatDuration(s.workMinutes)}</strong> worked
              </span>
              <span>
                <strong>{s.attendanceRate ?? "—"}%</strong> attendance
              </span>
            </div>
            <div className="panel att-modal-table">
              {data.days.length === 0 ? (
                <p className="panel-empty">No days to show for this month yet.</p>
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
                      {data.days.map(({ date, status, record }) => (
                        <tr key={date} className={status === "off" ? "is-off" : ""}>
                          <td className="att-date">{formatDay(date)}</td>
                          <td>{record ? formatTime(record.checkIn) : "—"}</td>
                          <td>
                            <CheckOutCell record={record} />
                          </td>
                          <td>
                            <WorkedCell record={record} now={now} />
                          </td>
                          <td>
                            <StatusPill status={status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )
      )}
    </Modal>
  );
}

// Downloads the month as an Excel file (Summary + Daily Details sheets)
function ExportButton({ month }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.get("/attendance/monthly/export", {
        params: { month },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-report-${month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      // Errors come back as a Blob too; read the JSON message out of it
      let message = getErrorMessage(err);
      if (err.response?.data instanceof Blob) {
        try {
          message = JSON.parse(await err.response.data.text()).message || message;
        } catch {
          /* keep the generic message */
        }
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="button button-secondary att-export" onClick={download} disabled={busy}>
        <DownloadIcon /> {busy ? "Preparing…" : "Export to Excel"}
      </button>
      {error && <span className="att-export-error">{error}</span>}
    </>
  );
}
