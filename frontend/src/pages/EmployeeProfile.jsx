import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/useAuth";
import {
  CALL_STATUSES,
  OFFICE_TIMEZONE,
  ROLE_LABELS,
  ROLES,
  SOURCE_LABELS,
  WORK_CATEGORIES,
  WORK_STATUS_LABELS,
} from "../config";
import Modal from "../components/Modal";
import EmployeeForm from "../components/EmployeeForm";
import StatusPill from "../components/StatusPill";
import AttendanceCalendar from "../components/AttendanceCalendar";
import { CallStatusPill, ContactLinks } from "../components/LeadBits";
import { CategoryBadge, WorkStatusPill } from "../components/WorkBits";
import { ArrowLeftIcon, LoginIcon, LogoutIcon, PencilIcon, PhoneIcon, ClipboardIcon, UserIcon } from "../components/Icons";
import {
  formatClock,
  formatWorkDays,
  formatDay,
  formatDuration,
  formatLongDay,
  formatMonth,
  formatPhone,
  formatTime,
  formatWhen,
  todayKey,
} from "../utils/format";
import "./Dashboard.css";
import "./Employees.css";
import "../components/AttendanceTable.css";
import "./Attendance.css";
import "./DailyReport.css";
import "./EmployeeProfile.css";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "attendance", label: "Attendance History" },
  { key: "daily", label: "Daily Work Reports" },
  { key: "pipeline", label: "Leads & Follow-ups" },
  { key: "performance", label: "Performance" },
  { key: "activity", label: "Activity History" },
];

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const maskAadhar = (a) => (a ? `XXXX XXXX ${a.slice(-4)}` : "Not provided");
const dayKeyOf = (iso) => formatDayKey(new Date(iso));
// "YYYY-MM-DD" of a timestamp in the office timezone
const formatDayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: OFFICE_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

// Admin view of one employee: everything about their work in one place
export default function EmployeeProfile() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = todayKey();
  const month = params.get("month") || today.slice(0, 7);
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "overview";
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: "", at: 0 });
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState("");

  const queryKey = `${id}|${month}|${reloadKey}`;
  const loading = result.key !== queryKey;

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/users/${id}/profile`, { params: { month } })
      .then(({ data }) => !cancelled && setResult({ key: queryKey, data, error: "", at: Date.now() }))
      .catch((err) => !cancelled && setResult({ key: queryKey, data: null, error: getErrorMessage(err), at: Date.now() }));
    return () => {
      cancelled = true;
    };
  }, [id, month, queryKey]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const setQuery = (changes) =>
    setParams({ tab, month, ...changes }, { replace: true });

  const closeEdit = useCallback(() => setEditing(false), [setEditing]);

  const data = result.data;
  const user = data?.user;

  if (result.error && !data) {
    return (
      <>
        <Link to="/employees" className="ep-back">
          <ArrowLeftIcon /> Employees
        </Link>
        <div className="alert">{result.error}</div>
      </>
    );
  }

  return (
    <>
      <Link to="/employees" className="ep-back">
        <ArrowLeftIcon /> Employees
      </Link>

      {/* ---------- Header ---------- */}
      <section className="ep-hero">
        {user ? (
          <>
            <span className="ep-avatar">
              {user.firstName[0]}
              {user.lastName[0]}
            </span>
            <div className="ep-hero-main">
              <h1>
                {user.firstName} {user.lastName}
              </h1>
              <p className="ep-hero-meta">
                {user.employeeId && <span className="ep-id">{user.employeeId}</span>}
                <span className={`role-pill role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
                {user.isActive === false && <span className="ep-off">Deactivated</span>}
                <span>{user.email}</span>
                <span>{formatPhone(user.phone)}</span>
                <span>Joined {formatLongDay(data.joined)}</span>
              </p>
            </div>
            <div className="ep-hero-side">
              {data.overview.today && data.hasClockIn && (
                <div className="ep-today">
                  <span>Today</span>
                  <StatusPill status={data.overview.today.status} />
                  {data.overview.today.working && <span className="att-live">Working now</span>}
                </div>
              )}
              <button type="button" className="button button-secondary" onClick={() => setEditing(true)}>
                <PencilIcon /> Edit
              </button>
            </div>
          </>
        ) : (
          <p className="panel-empty">Loading…</p>
        )}
      </section>

      {/* ---------- Tabs + month ---------- */}
      <div className="ep-bar">
        <div className="ep-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? "is-active" : ""}
              onClick={() => setQuery({ tab: t.key })}
            >
              {t.key === "pipeline" && user?.role === ROLES.DIGITAL_MARKETING ? "Work & Tasks" : t.label}
            </button>
          ))}
        </div>
        {tab !== "overview" && tab !== "pipeline" && (
          <input
            type="month"
            className="input ep-month"
            value={month}
            max={today.slice(0, 7)}
            onChange={(e) => e.target.value && setQuery({ month: e.target.value })}
            aria-label="Month"
          />
        )}
      </div>

      {result.error && <div className="alert att-alert">{result.error}</div>}

      <div className={loading && data ? "is-refreshing ep-body" : "ep-body"}>
        {!data ? (
          <div className="emp-loading">
            <div className="spinner" />
          </div>
        ) : tab === "overview" ? (
          <OverviewTab data={data} onTab={(t) => setQuery({ tab: t })} />
        ) : tab === "attendance" ? (
          <AttendanceTab data={data} />
        ) : tab === "daily" ? (
          <DailyTab data={data} />
        ) : tab === "pipeline" ? (
          <PipelineTab data={data} loadedAt={result.at} />
        ) : tab === "performance" ? (
          <PerformanceTab data={data} />
        ) : (
          <ActivityTab data={data} />
        )}
      </div>

      {editing && user && (
        <Modal title="Edit Employee" subtitle="Update employee details" onClose={closeEdit}>
          <EmployeeForm
            employee={user}
            isSelf={user._id === me._id}
            onSaved={(_u, message) => {
              setEditing(false);
              setToast(message);
              setReloadKey((k) => k + 1);
            }}
            onCancel={closeEdit}
          />
        </Modal>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

/* =================== Overview =================== */

function OverviewTab({ data, onTab }) {
  const { user, overview, hasClockIn } = data;
  const m = overview.month;
  const t = overview.today;
  const isTelecaller = user.role === ROLES.TELECALLER;
  const isMarketer = user.role === ROLES.DIGITAL_MARKETING;

  const cards = hasClockIn
    ? [
        { label: "Present", value: m.present, sub: `${m.late} late` },
        { label: "Absent", value: m.absent, sub: "Missed work days" },
        { label: "Hours Worked", value: formatDuration(m.workMinutes), sub: `Avg ${formatDuration(m.avgWorkMinutes)} / day` },
        { label: "Attendance", value: m.attendanceRate == null ? "—" : `${m.attendanceRate}%`, sub: formatMonth(m.month) },
      ]
    : [];
  if (isTelecaller) {
    cards.push(
      { label: "Calls Logged", value: m.calls.callsLogged, sub: `${plural(m.calls.leadsAdded, "new lead")}` },
      {
        label: "Converted",
        value: m.calls.converted,
        sub: m.calls.conversionRate == null ? "No calls yet" : `${m.calls.conversionRate}% of leads called`,
      }
    );
  }
  if (isMarketer) {
    cards.push(
      { label: "Work Updates", value: m.work.updates, sub: plural(m.work.itemsWorkedOn, "item") },
      { label: "Closed", value: m.work.closed, sub: `${m.work.won} won · ${m.work.lost} lost` }
    );
  }

  const details = [
    ["Email", user.email],
    ["Phone", formatPhone(user.phone)],
    ["Role", ROLE_LABELS[user.role]],
    ["Joined", formatLongDay(data.joined)],
    ["PAN", user.pan || "Not provided"],
    ["Aadhar", maskAadhar(user.aadhar)],
    ...(hasClockIn && user.schedule
      ? [
          ["Office timing", `${formatClock(user.schedule.officeStart)} – ${formatClock(user.schedule.officeEnd)}`],
          ["Late after", `${formatClock(user.schedule.lateAfter)} (${user.schedule.graceMinutes} min grace)`],
          ["Working days", formatWorkDays(user.schedule.workDays)],
          ["Schedule", user.schedule.custom ? "Custom for this employee" : "Company schedule"],
        ]
      : []),
    ["Account", user.isActive === false ? `Deactivated on ${formatLongDay(dayKeyOf(user.deactivatedAt))}` : "Active"],
  ];

  return (
    <div className="ep-grid">
      {hasClockIn && t && (
        <section className="panel ep-today-panel">
          <div className="panel-head">
            <h2>Today</h2>
            <StatusPill status={t.status} />
          </div>
          <div className="ep-kv">
            <div>
              <span>First in</span>
              <strong>{t.firstIn ? formatTime(t.firstIn) : "—"}</strong>
            </div>
            <div>
              <span>Last out</span>
              <strong>{t.working ? "Working" : t.lastOut ? formatTime(t.lastOut) : "—"}</strong>
            </div>
            <div>
              <span>Worked</span>
              <strong>{formatDuration(t.workMinutes)}</strong>
            </div>
            <div>
              <span>Sessions</span>
              <strong>{t.sessions}</strong>
            </div>
          </div>
        </section>
      )}

      {cards.length > 0 && (
        <section className="ep-cards-wrap">
          <p className="ep-section-title">This month · {formatMonth(m.month)}</p>
          <div className="ep-cards">
            {cards.map((c) => (
              <article key={c.label} className="stat-card">
                <div>
                  <p className="stat-label">{c.label}</p>
                  <p className="stat-value">{c.value}</p>
                  <p className="stat-sub">{c.sub}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Details</h2>
        </div>
        <dl className="ep-details">
          {details.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {data.pipeline && (
        <section className="panel">
          <div className="panel-head">
            <h2>{isTelecaller ? "Leads" : "Work items"}</h2>
            <button type="button" className="panel-link ep-link-btn" onClick={() => onTab("pipeline")}>
              Open
            </button>
          </div>
          <div className="ep-kv">
            <div>
              <span>Total</span>
              <strong>{data.pipeline.total}</strong>
            </div>
            {isTelecaller ? (
              <>
                <div>
                  <span>Converted</span>
                  <strong className="is-good">{data.pipeline.byStatus.converted || 0}</strong>
                </div>
                <div>
                  <span>Follow-ups</span>
                  <strong>{data.pipeline.followUps.length}</strong>
                </div>
                <div>
                  <span>Overdue</span>
                  <strong className={data.pipeline.overdue ? "is-bad" : ""}>{data.pipeline.overdue}</strong>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span>Won</span>
                  <strong className="is-good">{data.pipeline.byStatus.closed_won || 0}</strong>
                </div>
                <div>
                  <span>Open</span>
                  <strong>{data.pipeline.open.length}</strong>
                </div>
                <div>
                  <span>Overdue</span>
                  <strong className={data.pipeline.overdue ? "is-bad" : ""}>{data.pipeline.overdue}</strong>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {data.activity.length > 0 && (
        <section className="panel ep-span">
          <div className="panel-head">
            <h2>Latest activity</h2>
            <button type="button" className="panel-link ep-link-btn" onClick={() => onTab("activity")}>
              See all
            </button>
          </div>
          <Timeline events={data.activity.slice(0, 6)} showDate />
        </section>
      )}
    </div>
  );
}

/* =================== Attendance =================== */

function AttendanceTab({ data }) {
  if (!data.hasClockIn) return <p className="panel panel-empty">Admins don't clock in, so there's no attendance to show.</p>;
  const m = data.performance.at(-1);
  return (
    <>
      <div className="att-chips">
        <span>
          <strong>{m.present}</strong> present
        </span>
        <span>
          <strong>{m.late}</strong> late
        </span>
        <span>
          <strong>{m.halfDays}</strong> {m.halfDays === 1 ? "half day" : "half days"}
        </span>
        <span>
          <strong>{m.absent}</strong> absent
        </span>
        {m.leaveDays > 0 && (
          <span>
            <strong>{m.leaveDays}</strong> leave
          </span>
        )}
        <span>
          <strong>{m.holidays}</strong> {m.holidays === 1 ? "holiday" : "holidays"}
        </span>
        <span>
          <strong>{formatDuration(m.workMinutes)}</strong> worked
        </span>
        <span>
          <strong>{m.attendanceRate ?? "—"}%</strong> attendance
        </span>
      </div>
      <section className="panel ep-cal">
        <div className="panel-head">
          <h2>Calendar</h2>
        </div>
        <div className="ep-cal-body">
          <AttendanceCalendar
            month={data.month}
            days={data.days.map((d) => ({ ...d, record: d.firstIn ? { checkIn: d.firstIn, workMinutes: d.workMinutes } : null }))}
            holidays={data.holidays}
            leaves={data.leaves}
            today={data.today}
          />
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>{formatMonth(data.month)}</h2>
          <span className="att-meta">{plural(data.days.length, "day")}</span>
        </div>
        {data.days.length === 0 ? (
          <p className="panel-empty">No days to show for this month.</p>
        ) : (
          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>First in</th>
                  <th>Last out</th>
                  <th>Sessions</th>
                  <th className="num">Worked</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date} className={d.status === "off" ? "is-off" : ""}>
                    <td className="att-date">{formatDay(d.date)}</td>
                    <td>
                      <StatusPill status={d.status} />
                    </td>
                    <td>{d.firstIn ? formatTime(d.firstIn) : "—"}</td>
                    <td>{d.working ? <span className="att-live">Working</span> : d.lastOut ? formatTime(d.lastOut) : "—"}</td>
                    <td>
                      {d.sessions.length
                        ? d.sessions.map((s) => `${formatTime(s.in)}–${s.out ? formatTime(s.out) : "now"}`).join(", ")
                        : "—"}
                    </td>
                    <td className="num">{d.sessions.length ? formatDuration(d.workMinutes) : "—"}</td>
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

/* =================== Daily work reports =================== */

function DaySummary({ day }) {
  if (day.calls) {
    const c = day.calls;
    if (!c.callsLogged && !c.leadsAdded) return <span className="att-muted">No calls</span>;
    return (
      <span className="dr-activity">
        <strong>{plural(c.callsLogged, "call")}</strong>
        <span>{plural(c.leadsAdded, "new lead")}</span>
        {c.interested > 0 && <span>{c.interested} interested</span>}
        {c.converted > 0 && <span className="is-good">{c.converted} converted</span>}
      </span>
    );
  }
  if (day.work) {
    const w = day.work;
    if (!w.updates && !w.closed) return <span className="att-muted">No work updates</span>;
    return (
      <span className="dr-activity">
        <strong>{plural(w.updates, "update")}</strong>
        <span>{plural(w.itemsWorkedOn, "item")}</span>
        {w.closed > 0 && <span>{w.closed} closed</span>}
        {w.won > 0 && <span className="is-good">{w.won} won</span>}
        {w.lost > 0 && <span className="is-bad">{w.lost} lost</span>}
      </span>
    );
  }
  return null;
}

function DailyTab({ data }) {
  const [open, setOpen] = useState(null);
  if (!data.hasClockIn) return <p className="panel panel-empty">Admins don't have daily work reports.</p>;
  const eventsOn = (date) => data.activity.filter((a) => dayKeyOf(a.at) === date).slice().reverse();

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{formatMonth(data.month)} · day by day</h2>
        <span className="att-meta">Click a day to see what happened</span>
      </div>
      {data.days.length === 0 ? (
        <p className="panel-empty">No days to show for this month.</p>
      ) : (
        <ul className="ep-days">
          {data.days.map((d) => {
            const isOpen = open === d.date;
            return (
              <li key={d.date} className={isOpen ? "is-open" : ""}>
                <button type="button" className="ep-day-row" onClick={() => setOpen(isOpen ? null : d.date)}>
                  <span className="ep-day-date">{formatDay(d.date)}</span>
                  <StatusPill status={d.status} />
                  <span className="ep-day-hours">{d.sessions.length ? formatDuration(d.workMinutes) : "—"}</span>
                  <span className="ep-day-activity">
                    <DaySummary day={d} />
                  </span>
                  <span className="ep-chev">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && (
                  <div className="ep-day-detail">
                    {eventsOn(d.date).length ? (
                      <Timeline events={eventsOn(d.date)} />
                    ) : (
                      <p className="panel-empty">Nothing was logged on this day.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* =================== Leads & follow-ups / Work & tasks =================== */

function PipelineTab({ data, loadedAt }) {
  const p = data.pipeline;
  if (!p) return <p className="panel panel-empty">Admins don't have leads or work items.</p>;

  if (p.kind === "leads") {
    return (
      <div className="ep-stack">
        <div className="ep-status-strip">
          {CALL_STATUSES.map((s) => (
            <div key={s.value}>
              <CallStatusPill status={s.value} />
              <strong>{p.byStatus[s.value] || 0}</strong>
            </div>
          ))}
        </div>

        <section className="panel">
          <div className="panel-head">
            <h2>
              Follow-ups <span className="att-meta">({p.followUps.length})</span>
            </h2>
            {p.overdue > 0 && <span className="fu-overdue-count">{p.overdue} overdue</span>}
          </div>
          {p.followUps.length === 0 ? (
            <p className="panel-empty">No follow-ups scheduled.</p>
          ) : (
            <div className="att-table-wrap">
              <table className="att-table">
                <thead>
                  <tr>
                    <th>Due</th>
                    <th>Business</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {p.followUps.map((l) => {
                    const overdue = new Date(l.followUpAt).getTime() < loadedAt;
                    return (
                      <tr key={l._id}>
                        <td className={overdue ? "ep-overdue" : ""}>
                          {formatWhen(l.followUpAt)}
                          {overdue && <small>Overdue</small>}
                        </td>
                        <td className="lead-name">{l.businessName}</td>
                        <td>
                          <ContactLinks phone={l.phone} />
                        </td>
                        <td>
                          <CallStatusPill status={l.callStatus} />
                        </td>
                        <td className="ep-notes">{l.notes || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Recently updated leads</h2>
            <Link to="/leads" className="panel-link">
              All leads
            </Link>
          </div>
          {p.recentLeads.length === 0 ? (
            <p className="panel-empty">No leads yet.</p>
          ) : (
            <div className="att-table-wrap">
              <table className="att-table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Phone</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {p.recentLeads.map((l) => (
                    <tr key={l._id}>
                      <td className="lead-name">{l.businessName}</td>
                      <td>
                        <ContactLinks phone={l.phone} />
                      </td>
                      <td>{SOURCE_LABELS[l.source]}</td>
                      <td>
                        <CallStatusPill status={l.callStatus} />
                      </td>
                      <td className="att-muted">{formatWhen(l.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  // Digital marketer
  return (
    <div className="ep-stack">
      <div className="ep-status-strip">
        {Object.keys(WORK_STATUS_LABELS).map((s) => (
          <div key={s}>
            <WorkStatusPill status={s} />
            <strong>{p.byStatus[s] || 0}</strong>
          </div>
        ))}
      </div>
      <div className="ep-status-strip">
        {WORK_CATEGORIES.map((c) => (
          <div key={c.value}>
            <CategoryBadge category={c.value} />
            <strong>{p.byCategory[c.value] || 0}</strong>
          </div>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>
            Open work <span className="att-meta">({p.open.length})</span>
          </h2>
          {p.overdue > 0 && <span className="fu-overdue-count">{p.overdue} overdue</span>}
        </div>
        {p.open.length === 0 ? (
          <p className="panel-empty">Nothing open.</p>
        ) : (
          <WorkTable items={p.open} loadedAt={loadedAt} showDue />
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Recently closed</h2>
          <Link to="/work" className="panel-link">
            Work log
          </Link>
        </div>
        {p.recentClosed.length === 0 ? (
          <p className="panel-empty">Nothing closed yet.</p>
        ) : (
          <WorkTable items={p.recentClosed} loadedAt={loadedAt} />
        )}
      </section>
    </div>
  );
}

function WorkTable({ items, loadedAt, showDue }) {
  return (
    <div className="att-table-wrap">
      <table className="att-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Work</th>
            <th>Status</th>
            <th>{showDue ? "Due" : "Closed"}</th>
            <th>Last note</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const overdue = showDue && i.dueDate && new Date(i.dueDate).getTime() < loadedAt;
            const last = [...i.updates].reverse().find((u) => u.note);
            return (
              <tr key={i._id}>
                <td>
                  <CategoryBadge category={i.category} />
                </td>
                <td>
                  <p className="lead-name">{i.title}</p>
                  <p className="lead-notes-preview">
                    {[i.client, i.assignedBy && `From ${i.assignedBy.firstName}`].filter(Boolean).join(" · ")}
                  </p>
                </td>
                <td>
                  <WorkStatusPill status={i.status} />
                </td>
                <td className={overdue ? "ep-overdue" : "att-muted"}>
                  {showDue
                    ? i.dueDate
                      ? formatDay(dayKeyOf(i.dueDate))
                      : "—"
                    : i.closedAt
                      ? formatWhen(i.closedAt)
                      : "—"}
                  {overdue && <small>Overdue</small>}
                </td>
                <td className="ep-notes">{last?.note || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* =================== Performance =================== */

function Bars({ rows, value, format, tone = "terra", max }) {
  const values = rows.map((r) => (r.beforeJoining || r.future ? null : value(r)));
  const top = max ?? Math.max(1, ...values.filter((v) => v != null));
  return (
    <div className="ep-bars">
      {rows.map((r, i) => {
        const v = values[i];
        return (
          <div key={r.month} className={`ep-bar-col ${v == null ? "is-empty" : ""}`}>
            <span className="ep-bar-value">{v == null ? "—" : format(v)}</span>
            <div className="ep-bar-track">
              <div className={`ep-bar-fill tone-${tone}`} style={{ height: v == null ? 0 : `${Math.max(3, (v / top) * 100)}%` }} />
            </div>
            <span className="ep-bar-label">{formatMonth(r.month).split(" ")[0].slice(0, 3)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Trend({ current, previous, suffix = "", invert = false }) {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  if (!diff) return <span className="ep-trend">same as last month</span>;
  const good = invert ? diff < 0 : diff > 0;
  return (
    <span className={`ep-trend ${good ? "is-good" : "is-bad"}`}>
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
      {suffix} vs last month
    </span>
  );
}

function PerformanceTab({ data }) {
  if (!data.hasClockIn) return <p className="panel panel-empty">Admins don't have performance data.</p>;
  const rows = data.performance;
  const cur = rows.at(-1);
  const prev = rows.at(-2);
  const usable = (r) => r && !r.beforeJoining && !r.future;
  const isTelecaller = data.user.role === ROLES.TELECALLER;

  const charts = [
    {
      title: "Attendance %",
      value: (r) => r.attendanceRate ?? 0,
      format: (v) => `${v}%`,
      max: 100,
      tone: "good",
      headline: cur.attendanceRate == null ? "—" : `${cur.attendanceRate}%`,
      trend: usable(prev) && <Trend current={cur.attendanceRate} previous={prev.attendanceRate} suffix="%" />,
    },
    {
      title: "Hours worked",
      value: (r) => Math.round(r.workMinutes / 60),
      format: (v) => `${v}h`,
      headline: formatDuration(cur.workMinutes),
      trend: usable(prev) && <Trend current={Math.round(cur.workMinutes / 60)} previous={Math.round(prev.workMinutes / 60)} suffix="h" />,
    },
    {
      title: "Late days",
      value: (r) => r.late,
      format: (v) => v,
      tone: "bad",
      headline: cur.late,
      trend: usable(prev) && <Trend current={cur.late} previous={prev.late} invert />,
    },
  ];
  if (isTelecaller) {
    charts.push(
      {
        title: "Calls logged",
        value: (r) => r.calls.callsLogged,
        format: (v) => v,
        headline: cur.calls.callsLogged,
        trend: usable(prev) && <Trend current={cur.calls.callsLogged} previous={prev.calls.callsLogged} />,
      },
      {
        title: "Conversion rate",
        value: (r) => r.calls.conversionRate ?? 0,
        format: (v) => `${v}%`,
        max: 100,
        tone: "good",
        headline: cur.calls.conversionRate == null ? "—" : `${cur.calls.conversionRate}%`,
        trend: usable(prev) && <Trend current={cur.calls.conversionRate} previous={prev.calls.conversionRate} suffix="%" />,
      }
    );
  } else {
    charts.push(
      {
        title: "Items closed",
        value: (r) => r.work.closed,
        format: (v) => v,
        headline: cur.work.closed,
        trend: usable(prev) && <Trend current={cur.work.closed} previous={prev.work.closed} />,
      },
      {
        title: "Win rate",
        value: (r) => r.work.winRate ?? 0,
        format: (v) => `${v}%`,
        max: 100,
        tone: "good",
        headline: cur.work.winRate == null ? "—" : `${cur.work.winRate}%`,
        trend: usable(prev) && <Trend current={cur.work.winRate} previous={prev.work.winRate} suffix="%" />,
      }
    );
  }

  return (
    <div className="ep-stack">
      <p className="ep-section-title">
        Last 6 months up to {formatMonth(data.month)}. Months before {data.user.firstName} joined are greyed out.
      </p>
      <div className="ep-charts">
        {charts.map((c) => (
          <section key={c.title} className="panel ep-chart">
            <div className="ep-chart-head">
              <p>{c.title}</p>
              <strong>{c.headline}</strong>
              {c.trend}
            </div>
            <Bars rows={rows} value={c.value} format={c.format} tone={c.tone} max={c.max} />
          </section>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Month by month</h2>
        </div>
        <div className="att-table-wrap">
          <table className="att-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Present</th>
                <th className="num">Late</th>
                <th className="num">Absent</th>
                <th className="num">Hours</th>
                <th className="num">Attendance</th>
                {isTelecaller ? (
                  <>
                    <th className="num">Calls</th>
                    <th className="num">New leads</th>
                    <th className="num">Converted</th>
                    <th className="num">Conv. rate</th>
                  </>
                ) : (
                  <>
                    <th className="num">Updates</th>
                    <th className="num">Closed</th>
                    <th className="num">Won / Lost</th>
                    <th className="num">Win rate</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) =>
                r.beforeJoining ? (
                  <tr key={r.month} className="is-off">
                    <td className="att-date">{formatMonth(r.month)}</td>
                    <td colSpan={9} className="att-muted">
                      Before joining
                    </td>
                  </tr>
                ) : (
                  <tr key={r.month}>
                    <td className="att-date">{formatMonth(r.month)}</td>
                    <td className="num">{r.present}</td>
                    <td className="num">{r.late}</td>
                    <td className="num">{r.absent}</td>
                    <td className="num">{formatDuration(r.workMinutes)}</td>
                    <td className="num">{r.attendanceRate == null ? "—" : `${r.attendanceRate}%`}</td>
                    {isTelecaller ? (
                      <>
                        <td className="num">{r.calls.callsLogged}</td>
                        <td className="num">{r.calls.leadsAdded}</td>
                        <td className="num">{r.calls.converted}</td>
                        <td className="num">{r.calls.conversionRate == null ? "—" : `${r.calls.conversionRate}%`}</td>
                      </>
                    ) : (
                      <>
                        <td className="num">{r.work.updates}</td>
                        <td className="num">{r.work.closed}</td>
                        <td className="num">
                          {r.work.won} / {r.work.lost}
                        </td>
                        <td className="num">{r.work.winRate == null ? "—" : `${r.work.winRate}%`}</td>
                      </>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* =================== Activity =================== */

const EVENT_ICONS = { clock_in: LoginIcon, clock_out: LogoutIcon, lead: PhoneIcon, work: ClipboardIcon, joined: UserIcon };

function EventLine({ e }) {
  if (e.type === "clock_in") {
    return (
      <p>
        <strong>Clocked in</strong>
        {e.session > 1 ? ` (session ${e.session})` : ""}
        {e.late && <span className="ep-late"> · late</span>}
      </p>
    );
  }
  if (e.type === "clock_out") {
    return (
      <p>
        <strong>Clocked out</strong> · {formatDuration(e.minutes)} session
      </p>
    );
  }
  if (e.type === "lead") {
    return (
      <>
        <p>
          <strong>{e.businessName}</strong>
          <span className="att-muted"> · {e.kind === "added" ? "Lead added" : "Call update"}</span>
        </p>
        <p className="dr-line">
          <CallStatusPill status={e.status} />
          {e.note && <span>{e.note}</span>}
        </p>
      </>
    );
  }
  if (e.type === "work") {
    return (
      <>
        <p>
          <CategoryBadge category={e.category} /> <strong>{e.title}</strong>
          {e.client && <span className="att-muted"> · {e.client}</span>}
        </p>
        <p className="dr-line">
          {e.status ? <WorkStatusPill status={e.status} /> : <span className="att-muted">Note</span>}
          {e.note && <span>{e.note}</span>}
        </p>
      </>
    );
  }
  return (
    <p>
      <strong>Account created</strong>
    </p>
  );
}

function Timeline({ events, showDate = false }) {
  return (
    <ul className="ep-timeline">
      {events.map((e, i) => {
        const Icon = EVENT_ICONS[e.type] || UserIcon;
        return (
          <li key={i}>
            <span className={`ep-tl-icon type-${e.type}`}>
              <Icon width={14} height={14} />
            </span>
            <span className="dr-time">
              {showDate ? formatWhen(e.at) : formatTime(e.at)}
            </span>
            <div className="dr-event">
              <EventLine e={e} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ActivityTab({ data }) {
  const [filter, setFilter] = useState("all");
  const events = data.activity.filter(
    (e) => filter === "all" || (filter === "attendance" ? e.type.startsWith("clock") : e.type === filter)
  );
  // Group by day, newest first
  const groups = [];
  for (const e of events) {
    const key = dayKeyOf(e.at);
    if (!groups.length || groups.at(-1).key !== key) groups.push({ key, events: [] });
    groups.at(-1).events.push(e);
  }
  const filters = [
    ["all", "Everything"],
    ["attendance", "Attendance"],
    ...(data.user.role === ROLES.TELECALLER ? [["lead", "Calls & leads"]] : []),
    ...(data.user.role === ROLES.DIGITAL_MARKETING ? [["work", "Work updates"]] : []),
  ];

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{formatMonth(data.month)} · {plural(events.length, "event")}</h2>
        <div className="att-tabs ep-filter">
          {filters.map(([k, label]) => (
            <button key={k} type="button" className={filter === k ? "is-active" : ""} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {groups.length === 0 ? (
        <p className="panel-empty">No activity in this month.</p>
      ) : (
        groups.map((g) => (
          <div key={g.key} className="ep-day-group">
            <p className="ep-day-heading">{formatLongDay(g.key)}</p>
            <Timeline events={g.events} />
          </div>
        ))
      )}
    </section>
  );
}
