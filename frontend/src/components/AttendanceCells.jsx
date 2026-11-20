import { formatDuration, formatTime } from "../utils/format";
import { liveMinutes } from "../utils/attendance";

// "Working" while clocked in, otherwise the last clock-out time
export function CheckOutCell({ record }) {
  if (!record) return "—";
  if (record.activeSince) return <span className="att-live">Working</span>;
  return formatTime(record.checkOut);
}

// Total time for the day, plus how many sessions when there was more than one
export function WorkedCell({ record, now }) {
  if (!record) return "—";
  return (
    <>
      {formatDuration(liveMinutes(record, now))}
      {record.sessionCount > 1 && (
        <span className="att-sessions">{record.sessionCount} sessions</span>
      )}
    </>
  );
}
