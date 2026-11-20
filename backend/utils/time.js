// All attendance dates use the office timezone, not the server's,
// so "today" is the same for everyone no matter where the server runs.
// Read lazily: imports run before dotenv.config() in server.js.
const timezone = () => process.env.TIMEZONE || "Asia/Kolkata";

// Check-ins after this time (HH:MM, office timezone) are marked late
const lateAfter = () => process.env.LATE_AFTER || "10:00";

const partsIn = (date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );

// "2026-11-19"
export const dateKey = (date = new Date()) => {
  const p = partsIn(date);
  return `${p.year}-${p.month}-${p.day}`;
};

// "2026-11"
export const monthKey = (date = new Date()) => dateKey(date).slice(0, 7);

// The first moment of a day (office timezone) as a real Date
export const startOfDay = (key = dateKey()) => {
  const [y, m, d] = key.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  return new Date(endOfDay(prev).getTime() + 1);
};

// The last moment of a day (office timezone) as a real Date,
// e.g. "2026-11-19" in Asia/Kolkata -> 2026-11-19T18:29:59.999Z
export const endOfDay = (key = dateKey()) => {
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  // How far the office clock is ahead of UTC at that moment
  const p = partsIn(new Date(guess));
  const shownAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const offset = shownAsUtc - Math.floor(guess / 60000) * 60000;
  return new Date(guess - offset);
};

// True if the time of day is after LATE_AFTER
export const isLate = (date) => {
  const p = partsIn(date);
  const [lateH, lateM] = lateAfter().split(":").map(Number);
  return Number(p.hour) * 60 + Number(p.minute) > lateH * 60 + lateM;
};

const toMinutes = (hm) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

// Shown to staff so they know the rule. OFFICE_START is optional;
// without it there is no grace period to show, only the late cutoff.
export const attendancePolicy = () => {
  const officeStart = process.env.OFFICE_START || null;
  const late = lateAfter();
  return {
    officeStart, // "09:30"
    lateAfter: late, // "09:45"
    graceMinutes: officeStart ? Math.max(0, toMinutes(late) - toMinutes(officeStart)) : null,
  };
};

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Days people are expected to work, as day numbers (0 = Sunday ... 6 = Saturday).
// Default Monday–Saturday. Set WORK_DAYS=1,2,3,4,5 for a five-day week.
const workDays = () =>
  (process.env.WORK_DAYS || "1,2,3,4,5,6")
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => d >= 0 && d <= 6);

// Day of week for a "YYYY-MM-DD" key (noon UTC avoids timezone edge cases)
const dayOfWeek = (key) => new Date(`${key}T12:00:00Z`).getUTCDay();

export const isWorkDay = (key) => workDays().includes(dayOfWeek(key));

// Every date key in a month: ["2026-11-01", ..., "2026-11-30"]
export const daysInMonth = (month) => {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
};
