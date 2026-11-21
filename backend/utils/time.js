// All attendance dates use the office timezone, not the server's,
// so "today" is the same for everyone no matter where the server runs.
// Read lazily: imports run before dotenv.config() in server.js.
const timezone = () => process.env.TIMEZONE || "Asia/Kolkata";


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

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const toMinutes = (hm) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
const fromMinutes = (mins) =>
  `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/* ---------------- Work schedules ---------------- */

// Company defaults from .env. Employees without their own schedule use these.
export const companySchedule = () => {
  const officeStart = process.env.OFFICE_START || "09:30";
  const lateAfter = process.env.LATE_AFTER || "10:00";
  return {
    officeStart,
    officeEnd: process.env.OFFICE_END || "18:30",
    lateAfter,
    graceMinutes: Math.max(0, toMinutes(lateAfter) - toMinutes(officeStart)),
    workDays: (process.env.WORK_DAYS || "1,2,3,4,5,6")
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((d) => d >= 0 && d <= 6),
  };
};

// The schedule that applies to one employee: their own settings where set,
// company defaults for the rest. Works on documents and plain objects.
export const scheduleFor = (user) => {
  const company = companySchedule();
  const custom = Boolean(
    user?.officeStart || user?.officeEnd || user?.graceMinutes != null || user?.workDays?.length
  );
  if (!custom) return { ...company, custom: false };

  const officeStart = user.officeStart || company.officeStart;
  const graceMinutes = user.graceMinutes ?? company.graceMinutes;
  return {
    officeStart,
    officeEnd: user.officeEnd || company.officeEnd,
    graceMinutes,
    lateAfter: fromMinutes(toMinutes(officeStart) + graceMinutes),
    workDays: user.workDays?.length ? [...user.workDays].sort() : company.workDays,
    custom: true,
  };
};

// True if this clock-in time is after the employee's late cutoff
export const isLate = (date, user) => {
  const p = partsIn(date);
  return Number(p.hour) * 60 + Number(p.minute) > toMinutes(scheduleFor(user).lateAfter);
};

// Shown to staff so they know their rule
export const attendancePolicy = (user) => {
  const s = scheduleFor(user);
  return {
    officeStart: s.officeStart,
    officeEnd: s.officeEnd,
    lateAfter: s.lateAfter,
    graceMinutes: s.graceMinutes,
    workDays: s.workDays,
  };
};

// A finished day with less work than this (HH:MM) counts as a half day
export const halfDayMinutes = () => {
  const [h, m] = (process.env.HALF_DAY_BELOW || "04:30").split(":").map(Number);
  return h * 60 + (m || 0);
};

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Day of week for a "YYYY-MM-DD" key (noon UTC avoids timezone edge cases)
const dayOfWeek = (key) => new Date(`${key}T12:00:00Z`).getUTCDay();

// Is this one of the employee's working days? (0 = Sunday ... 6 = Saturday)
// Without a user, the company's working days are used.
export const isWorkDay = (key, user) => scheduleFor(user).workDays.includes(dayOfWeek(key));

// Every date key in a month: ["2026-11-01", ..., "2026-11-30"]
export const daysInMonth = (month) => {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
};
