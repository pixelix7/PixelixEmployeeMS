import { useEffect, useState } from "react";

// Re-renders every 30s while `active`, so running totals stay current
export function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

// Finished sessions plus the running one (if clocked in right now)
export const liveMinutes = (record, now) => {
  if (!record) return null;
  if (!record.activeSince) return record.workMinutes;
  const running = Math.max(0, Math.round((now - new Date(record.activeSince)) / 60000));
  return record.workMinutes + running;
};
