import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { ROLES, ROLE_LABELS } from "../config";
import StatusPill from "../components/StatusPill";
import { ArrowRightIcon, CalendarIcon, ClockIcon, DownloadIcon, PhoneIcon, ReportIcon, UsersIcon } from "../components/Icons";
import { formatDay, formatDuration, formatLongDay, formatMonth, formatTime, todayKey } from "../utils/format";
import { saveFile } from "../utils/saveFile";
import "./Dashboard.css";
import "../components/AttendanceTable.css";
import "./Attendance.css";
import "./Reports.css";

const TYPES = [
  { key: "daily", label: "Daily Report" },
  { key: "monthly", label: "Monthly Report" },
];

const fullName = (u) => `${u.firstName} ${u.lastName}`;
// plural(1, "call") -> "1 call", plural(2, "call") -> "2 calls"
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Admin report centre: pick daily or monthly, everyone or one employee,
// preview it, and download it as Excel or PDF.
export default function Reports() {
  const [params, setParams] = useSearchParams();
  const today = todayKey();
  const type = params.get("type") === "monthly" ? "monthly" : "daily";
  const date = params.get("date") || today;
  const month = params.get("month") || today.slice(0, 7);
  const employee = params.get("employee") || "";
  const [team, setTeam] = useState([]);

  useEffect(() => {
    api
      .get("/users", { params: { limit: 100 } })
      .then(({ data }) => setTeam(data.users.filter((u) => u.role !== ROLES.ADMIN)))
      .catch(() => setTeam([]));
  }, []);

  const update = (changes) => {
    const next = { type, date, month, employee, ...changes };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
  };

  const person = team.find((u) => u._id === employee);
  const query = { [type === "daily" ? "date" : "month"]: type === "daily" ? date : month, ...(employee && { user: employee }) };
  const url = `/reports/${type}?${new URLSearchParams(query)}`;
  const period = type === "daily" ? date : month;
  const filename = `${type}-report-${person ? `${slug(fullName(person))}-` : ""}${period}`;

  return (
    <>
      <header className="att-head">
        <div className="page-head">
          <h1>Reports</h1>
          <p>Daily and monthly reports for the whole team or one employee — download as Excel or PDF</p>
        </div>
        <div className="att-tabs" role="tablist">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={type === t.key}
              className={type === t.key ? "is-active" : ""}
              onClick={() => update({ type: t.key })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <section className="panel rep-controls">
        <div className="rep-fields">
          <label className="rep-field">
            <span>Employee</span>
            <select className="input" value={employee} onChange={(e) => update({ employee: e.target.value })}>
              <option value="">All employees</option>
              {team.map((u) => (
                <option key={u._id} value={u._id}>
                  {fullName(u)} · {ROLE_LABELS[u.role]}
                  {u.isActive === false ? " (deactivated)" : ""}
                </option>
              ))}
            </select>
          </label>
          {type === "daily" ? (
            <label className="rep-field">
              <span>Date</span>
              <input
                type="date"
                className="input"
                value={date}
                max={today}
                onChange={(e) => e.target.value && update({ date: e.target.value })}
              />
            </label>
          ) : (
            <label className="rep-field">
              <span>Month</span>
              <input
                type="month"
                className="input"
                value={month}
                max={today.slice(0, 7)}
                onChange={(e) => e.target.value && update({ month: e.target.value })}
              />
            </label>
          )}
        </div>
        <Downloads endpoint={`/reports/${type}/export`} query={query} filename={filename} />
      </section>

      <Preview key={url} url={url} type={type} single={Boolean(employee)} date={date} />
    </>
  );
}

/* ---------------- Download buttons ---------------- */

function Downloads({ endpoint, query, filename }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const download = async (format) => {
    setBusy(format);
    setError("");
    try {
      const res = await api.get(endpoint, { params: { ...query, format }, responseType: "blob" });
      await saveFile(res.data, `${filename}.${format}`);
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
      setBusy("");
    }
  };

  return (
    <div className="rep-downloads">
      <span className="rep-downloads-label">Download</span>
      <div className="rep-buttons">
        <button type="button" className="button button-secondary rep-btn rep-xlsx" onClick={() => download("xlsx")} disabled={Boolean(busy)}>
          <DownloadIcon /> {busy === "xlsx" ? "Preparing…" : "Excel"}
        </button>
        <button type="button" className="button button-secondary rep-btn rep-pdf" onClick={() => download("pdf")} disabled={Boolean(busy)}>
          <DownloadIcon /> {busy === "pdf" ? "Preparing…" : "PDF"}
        </button>
      </div>
      {error && <p className="rep-error">{error}</p>}
    </div>
  );
}

/* ---------------- Preview ---------------- */

function Preview({ url, type, single, date }) {
  const [result, setResult] = useState({ data: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    api
      .get(url)
      .then(({ data }) => !cancelled && setResult({ data, error: "" }))
      .catch((err) => !cancelled && setResult({ data: null, error: getErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const { data, error } = result;
  if (error) return <div className="alert">{error}</div>;
  if (!data) {
    return (
      <section className="panel">
        <p className="panel-empty">Loading preview…</p>
      </section>
    );
  }

  if (type === "daily") return single ? <DailySingle data={data} /> : <DailyTeam data={data} date={date} />;
  return single ? <MonthlySingle data={data} /> : <MonthlyTeam data={data} />;
}

function Stats({ items }) {
  return (
    <section className="stat-grid rep-stats">
      {items.map(({ label, value, sub, Icon }) => (
        <article key={label} className="stat-card">
          <div>
            <p className="stat-label">{label}</p>
            <p className="stat-value">{value}</p>
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

const PreviewHead = ({ title, note, children }) => (
  <div className="panel-head">
    <h2>
      {title}
      {note && <span className="att-meta"> · {note}</span>}
    </h2>
    {children}
  </div>
);

function DailyTeam({ data, date }) {
  const s = data.summary;
  return (
    <>
      <Stats
        items={[
          { label: "Present", value: `${s.present} / ${s.employees}`, sub: `${s.late} late · ${plural(s.halfDays, "half day")}`, Icon: UsersIcon },
          {
            label: data.isToday ? "Not In Yet" : "Absent",
            value: data.isToday ? s.notIn : s.absent,
            sub: s.onLeave ? `${s.onLeave} on leave` : "No check-in",
            Icon: CalendarIcon,
          },
          { label: "Hours Worked", value: formatDuration(s.workMinutes), sub: "Team total", Icon: ClockIcon },
          { label: "Calls Logged", value: s.callsLogged, sub: `${s.converted} converted · ${plural(s.workUpdates, "marketing update")}`, Icon: PhoneIcon },
        ]}
      />
      <section className="panel">
        <PreviewHead title={formatLongDay(data.date)} note={`${data.rows.length} employees`}>
          <Link to={`/reports/daily?date=${date}`} className="panel-link">
            Full activity <ArrowRightIcon width={16} height={16} />
          </Link>
        </PreviewHead>
        {data.holiday && <p className="rep-note">Holiday: {data.holiday}</p>}
        <div className="att-table-wrap">
          <table className="att-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Status</th>
                <th>First in</th>
                <th>Last out</th>
                <th>Worked</th>
                <th>Activity</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.user._id}>
                  <td>
                    <Link to={`/employees/${r.user._id}`} className="rep-name">
                      {fullName(r.user)}
                    </Link>
                    <span className="att-muted">{ROLE_LABELS[r.user.role]}</span>
                  </td>
                  <td>
                    <StatusPill status={r.attendance.status} />
                  </td>
                  <td>{r.attendance.firstIn ? formatTime(r.attendance.firstIn) : "—"}</td>
                  <td>{r.attendance.lastOut ? formatTime(r.attendance.lastOut) : r.attendance.working ? "Working" : "—"}</td>
                  <td>{r.attendance.workMinutes ? formatDuration(r.attendance.workMinutes) : "—"}</td>
                  <td className="att-muted">
                    {r.telecaller
                      ? `${plural(r.telecaller.callsLogged, "call")} · ${r.telecaller.converted} converted`
                      : r.marketing
                        ? `${plural(r.marketing.updates, "update")} · ${r.marketing.closed} closed`
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.rows.length === 0 && <p className="panel-empty">No employees on this day.</p>}
      </section>
    </>
  );
}

function DailySingle({ data }) {
  const r = data.rows[0];
  const a = r.attendance;
  const people = data.people || {};
  return (
    <>
      <Stats
        items={[
          { label: "Attendance", value: <StatusPill status={a.status} />, sub: plural(a.sessions, "session"), Icon: CalendarIcon },
          {
            label: "First In / Last Out",
            value: a.firstIn ? formatTime(a.firstIn) : "—",
            sub: a.lastOut ? `Out ${formatTime(a.lastOut)}` : a.working ? "Still working" : "—",
            Icon: ClockIcon,
          },
          { label: "Worked", value: formatDuration(a.workMinutes), sub: formatLongDay(data.date), Icon: ClockIcon },
          r.telecaller
            ? { label: "Calls Logged", value: r.telecaller.callsLogged, sub: `${plural(r.telecaller.leadsAdded, "lead")} added · ${r.telecaller.converted} converted`, Icon: PhoneIcon }
            : { label: "Work Updates", value: r.marketing?.updates ?? 0, sub: `${r.marketing?.closed ?? 0} closed · ${r.marketing?.won ?? 0} won`, Icon: ReportIcon },
        ]}
      />
      <section className="panel">
        <PreviewHead title={`${fullName(r.user)} · ${formatLongDay(data.date)}`}>
          <Link to={`/employees/${r.user._id}`} className="panel-link">
            Profile <ArrowRightIcon width={16} height={16} />
          </Link>
        </PreviewHead>
        {data.callEvents.length === 0 && data.workEvents.length === 0 ? (
          <p className="panel-empty">No calls or work updates logged on this day.</p>
        ) : (
          <ul className="rep-log">
            {[...data.callEvents.map((e) => ({ ...e, type: "call" })), ...data.workEvents.map((e) => ({ ...e, type: "work" }))]
              .sort((x, y) => new Date(x.at) - new Date(y.at))
              .map((e, i) => (
                <li key={i}>
                  <span className="rep-log-time">{formatTime(e.at)}</span>
                  <span className="rep-log-text">
                    {e.type === "call" ? (
                      <>
                        <strong>{e.businessName}</strong> — {e.kind === "added" ? "lead added" : (e.status || "").replace(/_/g, " ")}
                      </>
                    ) : (
                      <>
                        <strong>{e.title}</strong> — {e.status ? e.status.replace(/_/g, " ") : "note"}
                      </>
                    )}
                    {e.note && <span className="att-muted"> “{e.note}”</span>}
                    {e.type === "call" && people[e.userId] && e.userId !== r.user._id && (
                      <span className="att-muted"> · by {people[e.userId].name}</span>
                    )}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </>
  );
}

const rateClass = (rate) => (rate == null ? "" : rate >= 90 ? "is-good" : rate >= 70 ? "is-mid" : "is-bad");

function MonthlyTeam({ data }) {
  const s = data.summary;
  return (
    <>
      <Stats
        items={[
          { label: "Employees", value: s.employees, sub: `${plural(data.workingDays, "work day")} so far`, Icon: UsersIcon },
          { label: "Present Days", value: s.present, sub: `${s.late} late · ${plural(s.halfDays, "half day")}`, Icon: CalendarIcon },
          { label: "Absent Days", value: s.absent, sub: s.leaveDays ? plural(s.leaveDays, "leave day") : "No leave taken", Icon: CalendarIcon },
          { label: "Hours Worked", value: formatDuration(s.workMinutes), sub: "Team total", Icon: ClockIcon },
        ]}
      />
      <section className="panel">
        <PreviewHead title={formatMonth(data.month)} note={`${data.rows.length} employees`} />
        <div className="att-table-wrap">
          <table className="att-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Present</th>
                <th>Late</th>
                <th>Half</th>
                <th>Absent</th>
                <th>Leave</th>
                <th>Hours</th>
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.user._id}>
                  <td>
                    <Link to={`/employees/${r.user._id}`} className="rep-name">
                      {fullName(r.user)}
                    </Link>
                    <span className="att-muted">{ROLE_LABELS[r.user.role]}</span>
                  </td>
                  <td>{r.present}</td>
                  <td>{r.late}</td>
                  <td>{r.halfDays}</td>
                  <td className={r.absent ? "rep-bad" : ""}>{r.absent}</td>
                  <td>{r.leaveDays}</td>
                  <td>{formatDuration(r.workMinutes)}</td>
                  <td>
                    <span className={`rep-rate ${rateClass(r.attendanceRate)}`}>{r.attendanceRate ?? "—"}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.rows.length === 0 && <p className="panel-empty">No employees in this month.</p>}
      </section>
    </>
  );
}

function MonthlySingle({ data }) {
  const r = data.rows[0];
  return (
    <>
      <Stats
        items={[
          { label: "Attendance", value: `${r.attendanceRate ?? "—"}%`, sub: `${plural(data.workingDays, "work day")} so far`, Icon: CalendarIcon },
          { label: "Present Days", value: r.present, sub: `${r.onTime} on time · ${r.late} late`, Icon: UsersIcon },
          { label: "Absent / Leave", value: `${r.absent} / ${r.leaveDays}`, sub: `${plural(r.halfDays, "half day")} · ${plural(r.holidays, "holiday")}`, Icon: CalendarIcon },
          { label: "Hours Worked", value: formatDuration(r.workMinutes), sub: `Avg ${formatDuration(r.avgWorkMinutes)} / day`, Icon: ClockIcon },
        ]}
      />
      <section className="panel">
        <PreviewHead title={`${fullName(r.user)} · ${formatMonth(data.month)}`}>
          <Link to={`/employees/${r.user._id}`} className="panel-link">
            Profile <ArrowRightIcon width={16} height={16} />
          </Link>
        </PreviewHead>
        <div className="att-table-wrap">
          <table className="att-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>First in</th>
                <th>Last out</th>
                <th>Sessions</th>
                <th>Worked</th>
              </tr>
            </thead>
            <tbody>
              {r.days.map((d) => (
                <tr key={d.date}>
                  <td className="att-date">{formatDay(d.date)}</td>
                  <td>
                    <StatusPill status={d.status} />
                  </td>
                  <td>{d.record ? formatTime(d.record.checkIn) : "—"}</td>
                  <td>{d.record?.checkOut ? formatTime(d.record.checkOut) : d.record ? "Working" : "—"}</td>
                  <td>{d.record ? d.record.sessionCount : "—"}</td>
                  <td>{d.record ? formatDuration(d.record.workMinutes) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
