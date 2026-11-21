import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { OFFICE_TIMEZONE, ROLE_LABELS } from "../config";
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
  formatClock,
  formatDay,
  formatDuration,
  formatPhone,
  formatLongDay,
  formatMonth,
  formatTime,
  todayKey,
} from "../utils/format";
import { saveFile } from "../utils/saveFile";
import { Link } from "react-router-dom";
import AttendanceCalendar from "../components/AttendanceCalendar";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, TrashIcon } from "../components/Icons";
import "./Dashboard.css";
import "./Employees.css";
import "../components/AttendanceTable.css";
import "./Attendance.css";

const VIEWS = [
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Monthly" },
  { key: "calendar", label: "Calendar" },
  { key: "holidays", label: "Holidays" },
];

// Admin view of everyone's attendance: one day, a month summary,
// one person's month as a calendar, and the holiday list
export default function Attendance() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.key === params.get("view")) ? params.get("view") : "daily";
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
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              className={view === v.key ? "is-active" : ""}
              onClick={() => update({ view: v.key })}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>

      {(view === "daily" || view === "monthly") && (
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
      )}

      {view === "daily" ? (
        <DailyView key={date} date={date} search={search} />
      ) : view === "monthly" ? (
        <MonthlyView month={month} search={search} />
      ) : view === "calendar" ? (
        <CalendarView month={month} employeeId={params.get("employee") || ""} onChange={update} today={today} />
      ) : (
        <HolidaysView today={today} />
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
    if (!url) return; // nothing to load yet
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


// Cards with a `filter` key become buttons that filter the list below
function StatCards({ cards, active, onSelect }) {
  return (
    <section className="stat-grid">
      {cards.map(({ label, value, sub, Icon, filter }) => {
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
        if (!filter || !onSelect) {
          return (
            <article key={label} className="stat-card">
              {body}
            </article>
          );
        }
        const on = active === filter;
        return (
          <button
            key={label}
            type="button"
            className={`stat-card att-filter-card ${on ? "is-active" : ""}`}
            aria-pressed={on}
            onClick={() => onSelect(on ? null : filter)}
            title={on ? "Show everyone" : `Show only: ${label}`}
          >
            {body}
          </button>
        );
      })}
    </section>
  );
}

// Minutes since midnight in the office timezone, e.g. 9:52 am -> 592
const officeMinutes = (iso) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: OFFICE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return get("hour") * 60 + get("minute");
};
const hmToMinutes = (hm) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

// Which rows each daily card stands for (same rules as the backend summary)
const DAILY_FILTERS = {
  present: { title: "Present", test: (r) => Boolean(r.record) },
  late: { title: "Late arrivals", test: (r) => r.record?.status === "late" },
  not_in: { title: "Not in yet", test: (r) => r.status === "not_in" },
  absent: { title: "Absent", test: (r) => r.status === "absent" },
  working: { title: "Still working", test: (r) => Boolean(r.record && !r.record.checkOut) },
};

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
  const [filter, setFilter] = useState(null); // a DAILY_FILTERS key, or null for everyone
  const s = data?.summary;
  const isToday = data?.isToday;

  const cards = [
    {
      label: "Present",
      value: s && `${s.present} / ${s.total}`,
      sub: s?.halfDays ? `${s.halfDays} half day${s.halfDays === 1 ? "" : "s"}` : "Clocked in",
      Icon: UsersIcon,
      filter: "present",
    },
    { label: "Late", value: s?.late, sub: "After start time", Icon: AlarmIcon, filter: "late" },
    isToday
      ? { label: "Not In Yet", value: s?.notIn, sub: s?.onLeave ? `${s.onLeave} on leave` : "No check-in so far", Icon: CalendarIcon, filter: "not_in" }
      : { label: "Absent", value: s?.absent, sub: s?.onLeave ? `${s.onLeave} on leave` : "No check-in", Icon: CalendarIcon, filter: "absent" },
    { label: "Still Working", value: s?.working, sub: "Not clocked out", Icon: ClockIcon, filter: "working" },
  ];

  const active = filter && DAILY_FILTERS[filter];
  const rows = data?.rows.filter((r) => matches(r.user, search) && (!active || active.test(r))) ?? [];
  // Extra column that explains each filtered list
  const detail = filter === "late" ? "Late by" : filter === "not_in" || filter === "absent" ? "Contact" : filter === "working" ? "Working since" : null;

  return (
    <>
      {error && <div className="alert att-alert">{error}</div>}
      <StatCards
        cards={data && !loading ? cards : cards.map((c) => ({ ...c, value: undefined }))}
        active={filter}
        onSelect={setFilter}
      />

      {data && !data.isWorkDay && (
        <div className="notice notice-success att-alert">
          {data.holiday
            ? `${formatLongDay(date)} is a holiday (${data.holiday}), so nobody is marked absent.`
            : `${formatLongDay(date)} is not a work day, so nobody is marked absent.`}
        </div>
      )}

      <section className={`panel ${loading && data ? "is-refreshing" : ""}`}>
        <div className="panel-head">
          <h2>
            {active ? active.title : data ? formatLongDay(data.date) : "Loading…"}
            {active && data && (
              <span className="att-meta">
                {" "}
                · {rows.length} {rows.length === 1 ? "employee" : "employees"} · {formatDay(data.date)}
              </span>
            )}
          </h2>
          {active && (
            <button type="button" className="button button-secondary att-show-all" onClick={() => setFilter(null)}>
              Show everyone
            </button>
          )}
        </div>
        {!data ? (
          <p className="panel-empty">{loading ? "Loading…" : "No data."}</p>
        ) : rows.length === 0 ? (
          <p className="panel-empty">
            {data.rows.length === 0
              ? "No staff had joined by this date."
              : active
                ? search.trim()
                  ? `No one in “${active.title.toLowerCase()}” matches your search.`
                  : `No one is in “${active.title.toLowerCase()}” right now.`
                : "No employees match your search."}
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
                  {detail && <th>{detail}</th>}
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
                      {detail && (
                        <td>
                          <DetailCell filter={filter} user={user} record={record} />
                        </td>
                      )}
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

// The extra column shown for a filtered daily list
function DetailCell({ filter, user, record }) {
  const schedule = user.schedule;
  if (filter === "late" && record && schedule) {
    const by = officeMinutes(record.checkIn) - hmToMinutes(schedule.officeStart);
    return (
      <span className="att-detail is-late">
        <strong>{formatDuration(Math.max(by, 0))}</strong>
        <small>after {formatClock(schedule.officeStart)} start</small>
      </span>
    );
  }
  if (filter === "working" && record) {
    const since = record.activeSince || record.checkIn;
    return (
      <span className="att-detail">
        <strong>{formatTime(since)}</strong>
        <small>{record.sessionCount > 1 ? `Session ${record.sessionCount}` : "Since first check-in"}</small>
      </span>
    );
  }
  if (filter === "not_in" || filter === "absent") {
    return (
      <span className="att-detail">
        <a href={`tel:${user.phone}`} className="att-call">
          {formatPhone(user.phone)}
        </a>
        {schedule && <small>Shift starts {formatClock(schedule.officeStart)}</small>}
      </span>
    );
  }
  return "—";
}

/* ---------------- Monthly ---------------- */

function MonthlyView({ month, search }) {
  const { data, error, loading } = useReport(`/attendance/monthly?month=${month}`);
  const [selected, setSelected] = useState(null);
  const s = data?.summary;

  const cards = [
    { label: "Present Days", value: s?.present, sub: "Late & half days included", Icon: UsersIcon },
    {
      label: "Late Days",
      value: s?.late,
      sub: s ? `${s.halfDays} half day${s.halfDays === 1 ? "" : "s"}` : "",
      Icon: AlarmIcon,
    },
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
                  <th className="num">Half</th>
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
                    <td className="num">{r.halfDays}</td>
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
        Present includes late and half days; a half day counts as 0.5 in Attendance. Absent counts
        finished work days with no check-in since the employee joined — holidays never count. Click a
        row to see each day.
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
                <strong>{s.halfDays}</strong> half day{s.halfDays === 1 ? "" : "s"}
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
      await saveFile(res.data, `attendance-report-${month}.xlsx`);
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

/* ---------------- Calendar: one person's month ---------------- */

const shiftMonth = (month, delta) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};

function CalendarView({ month, employeeId, onChange, today }) {
  const [staff, setStaff] = useState(null);
  const thisMonth = today.slice(0, 7);

  // Telecallers and digital marketers (admins don't clock in)
  useEffect(() => {
    api
      .get("/users", { params: { limit: 100 } })
      .then(({ data }) => setStaff(data.users.filter((u) => u.role !== "admin")))
      .catch(() => setStaff([]));
  }, []);

  const selected = employeeId || staff?.[0]?._id || "";
  const { data, error, loading } = useReport(selected ? `/attendance/user/${selected}?month=${month}` : null);
  const s = data?.summary;

  return (
    <>
      <div className="att-toolbar">
        <div className="att-picker">
          <select
            className="input cal-person"
            value={selected}
            onChange={(e) => onChange({ view: "calendar", employee: e.target.value })}
            aria-label="Employee"
            disabled={!staff?.length}
          >
            {!staff && <option>Loading…</option>}
            {staff?.map((u) => (
              <option key={u._id} value={u._id}>
                {u.firstName} {u.lastName} — {ROLE_LABELS[u.role]}
                {u.isActive === false ? " (deactivated)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="att-picker cal-month-nav">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onChange({ view: "calendar", employee: selected, month: shiftMonth(month, -1) })}
            aria-label="Previous month"
          >
            <ArrowLeftIcon />
          </button>
          <input
            type="month"
            className="input"
            value={month}
            max={thisMonth}
            onChange={(e) => e.target.value && onChange({ view: "calendar", employee: selected, month: e.target.value })}
            aria-label="Month"
          />
          <button
            type="button"
            className="button button-secondary"
            disabled={month >= thisMonth}
            onClick={() => onChange({ view: "calendar", employee: selected, month: shiftMonth(month, 1) })}
            aria-label="Next month"
          >
            <ArrowRightIcon />
          </button>
        </div>
      </div>

      {staff && staff.length === 0 && <p className="panel panel-empty">No telecallers or digital marketers yet.</p>}
      {error && <div className="alert att-alert">{error}</div>}

      {selected && (
        <section className={`panel cal-panel ${loading && data ? "is-refreshing" : ""}`}>
          <div className="panel-head">
            <h2>
              {data ? `${data.user.firstName} ${data.user.lastName}` : "Loading…"}
              <span className="att-meta"> · {formatMonth(month)}</span>
            </h2>
            {data && (
              <Link to={`/employees/${data.user._id}`} className="panel-link">
                Full profile <ArrowRightIcon width={16} height={16} />
              </Link>
            )}
          </div>
          {data ? (
            <div className="cal-body">
              <div className="att-chips">
                <span><strong>{s.present}</strong> present</span>
                <span><strong>{s.late}</strong> late</span>
                <span><strong>{s.halfDays}</strong> half day{s.halfDays === 1 ? "" : "s"}</span>
                <span><strong>{s.absent}</strong> absent</span>
                {s.leaveDays > 0 && <span><strong>{s.leaveDays}</strong> leave</span>}
                <span><strong>{s.holidays}</strong> holiday{s.holidays === 1 ? "" : "s"}</span>
                <span><strong>{formatDuration(s.workMinutes)}</strong> worked</span>
                <span><strong>{s.attendanceRate ?? "—"}%</strong> attendance</span>
              </div>
              <AttendanceCalendar month={month} days={data.days} holidays={data.holidays} leaves={data.leaves} today={data.today} />
            </div>
          ) : (
            <div className="emp-loading">
              <div className="spinner" />
            </div>
          )}
        </section>
      )}
    </>
  );
}

/* ---------------- Holidays ---------------- */

function HolidaysView({ today }) {
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [reloadKey, setReloadKey] = useState(0);
  const { data, error, loading } = useReport(
    `/holidays?from=${year}-01-01&to=${year}-12-31&r=${reloadKey}`
  );
  const [form, setForm] = useState({ date: "", name: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmId, setConfirmId] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await api.post("/holidays", form);
      setForm({ date: "", name: "" });
      if (Number(form.date.slice(0, 4)) !== year) setYear(Number(form.date.slice(0, 4)));
      setReloadKey((k) => k + 1);
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      setFormError(fieldErrors ? Object.values(fieldErrors).join(" ") : getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/holidays/${id}`);
      setConfirmId(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  const holidays = data?.holidays ?? [];
  const upcoming = holidays.filter((h) => h.date >= today);

  return (
    <div className="hol-layout">
      <section className="panel">
        <div className="panel-head">
          <h2>Add a holiday</h2>
        </div>
        <form className="hol-form" onSubmit={add}>
          <label className="form-field">
            <span>Date</span>
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </label>
          <label className="form-field">
            <span>Name</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Diwali"
              maxLength={80}
              required
            />
          </label>
          {formError && <p className="form-error">{formError}</p>}
          <button type="submit" className="button button-primary" disabled={saving || !form.date || !form.name.trim()}>
            <PlusIcon /> {saving ? "Adding…" : "Add Holiday"}
          </button>
          <p className="form-hint">
            Holidays are never counted as absent. If someone works on a holiday, it counts as a normal day.
          </p>
        </form>
      </section>

      <section className={`panel ${loading && data ? "is-refreshing" : ""}`}>
        <div className="panel-head">
          <h2>
            Holidays in {year}
            <span className="att-meta"> · {holidays.length} total, {upcoming.length} upcoming</span>
          </h2>
          <div className="att-picker">
            <button type="button" className="button button-secondary hol-year" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
              <ArrowLeftIcon />
            </button>
            <button type="button" className="button button-secondary hol-year" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
              <ArrowRightIcon />
            </button>
          </div>
        </div>
        {error && <p className="panel-empty">{error}</p>}
        {!data ? (
          <p className="panel-empty">Loading…</p>
        ) : holidays.length === 0 ? (
          <p className="panel-empty">No holidays added for {year} yet.</p>
        ) : (
          <ul className="hol-list">
            {holidays.map((h) => (
              <li key={h._id} className={h.date < today ? "is-past" : ""}>
                <span className="hol-date">
                  <strong>{Number(h.date.slice(8))}</strong>
                  <small>{formatMonth(h.date.slice(0, 7)).split(" ")[0].slice(0, 3)}</small>
                </span>
                <div className="hol-main">
                  <p className="hol-name">{h.name}</p>
                  <p className="att-muted">{formatLongDay(h.date)}</p>
                </div>
                {confirmId === h._id ? (
                  <span className="hol-confirm">
                    Remove?
                    <button type="button" className="button button-danger" onClick={() => remove(h._id)}>
                      Remove
                    </button>
                    <button type="button" className="button button-secondary" onClick={() => setConfirmId(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="hol-delete"
                    onClick={() => setConfirmId(h._id)}
                    aria-label={`Remove ${h.name}`}
                  >
                    <TrashIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
