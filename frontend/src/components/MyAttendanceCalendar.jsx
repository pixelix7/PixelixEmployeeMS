import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { formatDuration, formatLongDay, formatMonth, todayKey } from "../utils/format";
import AttendanceCalendar from "./AttendanceCalendar";
import { ArrowLeftIcon, ArrowRightIcon } from "./Icons";
import "./MyAttendanceCalendar.css";

const shiftMonth = (month, delta) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};

// The logged-in employee's own month: calendar, totals and upcoming holidays.
// `refreshKey` changes after clock-in/out so today's square updates.
export default function MyAttendanceCalendar({ refreshKey = 0 }) {
  const today = todayKey();
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [result, setResult] = useState({ key: null, data: null, error: "" });
  const [upcoming, setUpcoming] = useState([]);

  const key = `${month}|${refreshKey}`;
  const loading = result.key !== key;

  useEffect(() => {
    let cancelled = false;
    api
      .get("/attendance/me/calendar", { params: { month } })
      .then(({ data }) => !cancelled && setResult({ key, data, error: "" }))
      .catch((err) => !cancelled && setResult({ key, data: null, error: getErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [key, month]);

  useEffect(() => {
    api
      .get("/holidays", { params: { from: today } })
      .then(({ data }) => setUpcoming(data.holidays.slice(0, 4)))
      .catch(() => setUpcoming([]));
  }, [today]);

  const data = result.data;
  const s = data?.summary;

  return (
    <section className={`panel my-cal ${loading && data ? "is-refreshing" : ""}`}>
      <div className="panel-head">
        <h2>My attendance</h2>
        <div className="my-cal-nav">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
            <ArrowLeftIcon width={16} height={16} />
          </button>
          <span>{formatMonth(month)}</span>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= thisMonth}
            aria-label="Next month"
          >
            <ArrowRightIcon width={16} height={16} />
          </button>
        </div>
      </div>

      {result.error && <p className="panel-empty">{result.error}</p>}

      {data && (
        <div className="my-cal-body">
          <div className="my-cal-main">
            <div className="att-chips">
              <span><strong>{s.present}</strong> present</span>
              <span><strong>{s.late}</strong> late</span>
              <span><strong>{s.halfDays}</strong> half day{s.halfDays === 1 ? "" : "s"}</span>
              <span><strong>{s.absent}</strong> absent</span>
              {s.leaveDays > 0 && <span><strong>{s.leaveDays}</strong> leave</span>}
              <span><strong>{formatDuration(s.workMinutes)}</strong> worked</span>
              <span><strong>{s.attendanceRate ?? "—"}%</strong> attendance</span>
            </div>
            <AttendanceCalendar month={month} days={data.days} holidays={data.holidays} leaves={data.leaves} today={data.today} />
          </div>

          <aside className="my-cal-side">
            <p className="my-cal-side-title">Upcoming holidays</p>
            {upcoming.length === 0 ? (
              <p className="att-muted my-cal-none">None scheduled yet.</p>
            ) : (
              <ul>
                {upcoming.map((h) => (
                  <li key={h._id}>
                    <span className="hol-date">
                      <strong>{Number(h.date.slice(8))}</strong>
                      <small>{formatMonth(h.date.slice(0, 7)).split(" ")[0].slice(0, 3)}</small>
                    </span>
                    <div>
                      <p className="my-cal-hname">{h.name}</p>
                      <p className="att-muted">{formatLongDay(h.date).split(",")[0]}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
      {!data && !result.error && <p className="panel-empty">Loading…</p>}
    </section>
  );
}
