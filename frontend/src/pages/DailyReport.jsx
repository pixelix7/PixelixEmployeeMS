import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { ROLES, ROLE_LABELS } from "../config";
import Modal from "../components/Modal";
import StatusPill from "../components/StatusPill";
import { CallStatusPill } from "../components/LeadBits";
import { CategoryBadge, WorkStatusPill } from "../components/WorkBits";
import {
  AlarmIcon,
  ClockIcon,
  DownloadIcon,
  MegaphoneIcon,
  PhoneIcon,
  SearchIcon,
  UsersIcon,
} from "../components/Icons";
import { formatDuration, formatLongDay, formatTime, todayKey } from "../utils/format";
import "./Dashboard.css";
import "./Employees.css";
import "../components/AttendanceTable.css";
import "./Attendance.css";
import "./DailyReport.css";

// One page for "what did everyone do today?" with an Excel export
export default function DailyReport() {
  const [params, setParams] = useSearchParams();
  const today = todayKey();
  const date = params.get("date") || today;
  const [search, setSearch] = useState("");
  const [result, setResult] = useState({ date: null, data: null, error: "" });
  const [selected, setSelected] = useState(null);

  const loading = result.date !== date;

  useEffect(() => {
    let cancelled = false;
    api
      .get("/reports/daily", { params: { date } })
      .then(({ data }) => !cancelled && setResult({ date, data, error: "" }))
      .catch((err) => !cancelled && setResult({ date, data: null, error: getErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [date]);

  const data = result.data;
  const s = data?.summary;
  const q = search.trim().toLowerCase();
  const rows =
    data?.rows.filter((r) => !q || `${r.user.firstName} ${r.user.lastName} ${r.user.email}`.toLowerCase().includes(q)) ?? [];

  const cards = [
    { label: "Present", value: s && `${s.present} / ${s.employees}`, sub: s && `${s.late} late`, Icon: UsersIcon },
    {
      label: data?.isToday ? "Not In Yet" : "Absent",
      value: s && (data.isToday ? s.notIn : s.absent),
      sub: "No check-in",
      Icon: AlarmIcon,
    },
    { label: "Hours Worked", value: s && formatDuration(s.workMinutes), sub: "Team total", Icon: ClockIcon },
    {
      label: "Calls Logged",
      value: s?.callsLogged,
      sub: s && `${plural(s.leadsAdded, "new lead")} · ${s.converted} converted`,
      Icon: PhoneIcon,
    },
    {
      label: "Marketing Updates",
      value: s?.workUpdates,
      sub: s && `${s.workClosed} closed · ${s.workWon} won`,
      Icon: MegaphoneIcon,
    },
  ];

  return (
    <>
      <header className="att-head">
        <div className="page-head">
          <h1>Daily Report</h1>
          <p>Attendance, calls and marketing work for every employee</p>
        </div>
      </header>

      <div className="att-toolbar">
        <div className="att-picker">
          <input
            type="date"
            className="input"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setParams({ date: e.target.value }, { replace: true })}
            aria-label="Date"
          />
          {date !== today && (
            <button type="button" className="button button-secondary" onClick={() => setParams({}, { replace: true })}>
              Today
            </button>
          )}
          <ExportButton date={date} />
        </div>
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

      {result.error && <div className="alert att-alert">{result.error}</div>}

      <section className="stat-grid dr-cards">
        {cards.map(({ label, value, sub, Icon }) => (
          <article key={label} className="stat-card">
            <div>
              <p className="stat-label">{label}</p>
              <p className="stat-value">{!loading && value != null ? value : <span className="skeleton" />}</p>
              {!loading && sub && <p className="stat-sub">{sub}</p>}
            </div>
            <span className="stat-icon">
              <Icon />
            </span>
          </article>
        ))}
      </section>

      <section className={`panel ${loading && data ? "is-refreshing" : ""}`}>
        <div className="panel-head">
          <h2>{data ? formatLongDay(data.date) : "Loading…"}</h2>
          {data?.isToday && <span className="att-meta">Live — updates as people work</span>}
        </div>
        {!data ? (
          <p className="panel-empty">{loading ? "Loading…" : "No data."}</p>
        ) : rows.length === 0 ? (
          <p className="panel-empty">
            {data.rows.length === 0 ? "No staff had joined by this date." : "No employees match your search."}
          </p>
        ) : (
          <div className="att-table-wrap">
            <table className="att-table att-table-clickable">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Attendance</th>
                  <th>In</th>
                  <th>Out</th>
                  <th className="num">Worked</th>
                  <th>Day's activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.user._id}
                    tabIndex={0}
                    onClick={() => setSelected(r)}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(r)}
                    title="See this person's day"
                  >
                    <td>
                      <div className="att-person">
                        <span className="person-avatar">
                          {r.user.firstName[0]}
                          {r.user.lastName[0]}
                        </span>
                        <div className="person-main">
                          <p className="person-name">
                            {r.user.firstName} {r.user.lastName}
                          </p>
                          <p className="person-email">{ROLE_LABELS[r.user.role]}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusPill status={r.attendance.status} />
                    </td>
                    <td>{r.attendance.firstIn ? formatTime(r.attendance.firstIn) : "—"}</td>
                    <td>
                      {r.attendance.working ? (
                        <span className="att-live">Working</span>
                      ) : r.attendance.lastOut ? (
                        formatTime(r.attendance.lastOut)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num">
                      {r.attendance.sessions ? formatDuration(r.attendance.workMinutes) : "—"}
                      {r.attendance.sessions > 1 && <span className="att-sessions">{r.attendance.sessions} sessions</span>}
                    </td>
                    <td>
                      <ActivitySummary row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && data && (
        <PersonDay row={selected} data={data} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

// "1 call" / "3 calls"
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function ActivitySummary({ row }) {
  if (row.telecaller) {
    const t = row.telecaller;
    if (!t.callsLogged && !t.leadsAdded && !t.followUpsDue) return <span className="att-muted">No calls logged</span>;
    return (
      <span className="dr-activity">
        <strong>{plural(t.callsLogged, "call")}</strong>
        <span>{plural(t.leadsAdded, "new lead")}</span>
        {t.interested > 0 && <span>{t.interested} interested</span>}
        {t.converted > 0 && <span className="is-good">{t.converted} converted</span>}
        {t.followUpsMissed > 0 && (
          <span className="is-bad">{plural(t.followUpsMissed, "follow-up")} missed</span>
        )}
      </span>
    );
  }
  if (row.marketing) {
    const m = row.marketing;
    if (!m.updates && !m.closed) return <span className="att-muted">No work updates</span>;
    return (
      <span className="dr-activity">
        <strong>{plural(m.updates, "update")}</strong>
        <span>{plural(m.itemsWorkedOn, "item")}</span>
        {m.closed > 0 && <span>{m.closed} closed</span>}
        {m.won > 0 && <span className="is-good">{m.won} won</span>}
        {m.lost > 0 && <span className="is-bad">{m.lost} lost</span>}
      </span>
    );
  }
  return null;
}

// Everything one person did that day, in time order
function PersonDay({ row, data, onClose }) {
  const id = String(row.user._id);
  const isTelecaller = row.user.role === ROLES.TELECALLER;
  const events = isTelecaller
    ? data.callEvents.filter((e) => e.userId === id)
    : data.workEvents.filter((e) => e.userId === id);

  return (
    <Modal
      title={`${row.user.firstName} ${row.user.lastName}`}
      subtitle={`${ROLE_LABELS[row.user.role]} · ${formatLongDay(data.date)}`}
      onClose={onClose}
    >
      <div className="att-chips">
        <span>
          <StatusPill status={row.attendance.status} />
        </span>
        <span>
          <strong>{formatDuration(row.attendance.workMinutes)}</strong> worked
        </span>
        {row.sessions.map((s, i) => (
          <span key={i}>
            Session {i + 1}: <strong>{formatTime(s.in)}</strong> – {s.out ? formatTime(s.out) : "now"}
          </span>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>{isTelecaller ? "Calls & leads" : "Work updates"}</h2>
          <span className="att-meta">{events.length} entries</span>
        </div>
        {events.length === 0 ? (
          <p className="panel-empty">Nothing logged on this day.</p>
        ) : (
          <ul className="dr-timeline">
            {events.map((e, i) => (
              <li key={i}>
                <span className="dr-time">{formatTime(e.at)}</span>
                <div className="dr-event">
                  {isTelecaller ? (
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
                  ) : (
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
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function ExportButton({ date }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.get("/reports/daily/export", { params: { date }, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daily-report-${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
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
