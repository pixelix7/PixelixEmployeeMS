import { DAY_STATUS_LABELS } from "../config";
import { formatDuration, formatTime } from "../utils/format";
import "./AttendanceCalendar.css";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEGEND = ["present", "late", "half_day", "absent", "leave", "holiday", "off"];

// Monday-first index (0 = Mon ... 6 = Sun) of a "YYYY-MM-DD"
const weekdayIndex = (key) => (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;

const daysOfMonth = (month) => {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
};

// Month grid for one person.
// days: [{ date, status, record }] for the days that count (joined -> today)
// holidays: [{ date, name }] for the whole month (future ones too)
// leaves: [{ date, type, halfDay }] approved leave in the month (future ones too)
export default function AttendanceCalendar({ month, days, holidays = [], leaves = [], today, compact = false }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const holidayByDate = new Map(holidays.map((h) => [h.date, h.name]));
  const leaveByDate = new Map(leaves.map((l) => [l.date, l]));
  const all = daysOfMonth(month);
  const blanks = weekdayIndex(all[0]);

  return (
    <div className={`cal ${compact ? "is-compact" : ""}`}>
      <div className="cal-grid" role="grid" aria-label="Attendance calendar">
        {WEEKDAYS.map((d) => (
          <div key={d} className="cal-weekday" role="columnheader">
            {compact ? d[0] : d}
          </div>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <div key={`b${i}`} className="cal-cell is-blank" aria-hidden />
        ))}
        {all.map((date) => {
          const day = byDate.get(date);
          const holiday = holidayByDate.get(date);
          const leave = leaveByDate.get(date);
          // Days not in `days` are in the future or before joining
          const status = day
            ? day.status
            : holiday
              ? "holiday"
              : date > today
                ? leave ? "leave-upcoming" : "future"
                : "none";
          const record = day?.record;
          const leaveText = leave && (leave.halfDay ? "Half-day leave" : "On leave");
          const label = status === "leave-upcoming" ? leaveText : DAY_STATUS_LABELS[status];
          return (
            <div
              key={date}
              role="gridcell"
              className={`cal-cell st-${status} ${date === today ? "is-today" : ""}`}
              title={[date, record && leave ? leaveText : label, holiday].filter(Boolean).join(" · ")}
            >
              <span className="cal-num">{Number(date.slice(8))}</span>
              {!compact && (
                <>
                  {record ? (
                    <span className="cal-meta">
                      {formatTime(record.checkIn)}
                      <strong>{formatDuration(record.workMinutes)}</strong>
                    </span>
                  ) : holiday ? (
                    <span className="cal-meta cal-holiday">{holiday}</span>
                  ) : label && status !== "off" ? (
                    <span className="cal-meta">{status === "leave" ? leaveText || label : label}</span>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="cal-legend">
        {LEGEND.map((s) => (
          <span key={s}>
            <i className={`cal-dot st-${s}`} />
            {DAY_STATUS_LABELS[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
