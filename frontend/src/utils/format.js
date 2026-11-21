import { OFFICE_TIMEZONE } from "../config";

// "9:41 am"
export const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: OFFICE_TIMEZONE,
  });

// "2026-11-19" -> "Thu, 19 Nov"
export const formatDay = (dateKey) =>
  new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

// "2026-11-19" -> "Thursday, 19 November 2026"
export const formatLongDay = (dateKey) =>
  new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

// "2026-11" -> "November 2026"
export const formatMonth = (monthKey) =>
  new Date(`${monthKey}-15T12:00:00Z`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

// "09:45" -> "9:45 am"
export const formatClock = (hm) => {
  const [h, m] = hm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
};

// 505 -> "8h 25m"
export const formatDuration = (minutes) => {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};

// Today's date in the office timezone as "YYYY-MM-DD"
export const todayKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: OFFICE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

// "Thursday, 19 November"
export const todayLabel = () =>
  new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: OFFICE_TIMEZONE,
  });

const dayKeyIn = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: OFFICE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

// Follow-up times: "Today, 3:30 pm" / "Yesterday, 11:00 am" / "Tomorrow, 11:00 am" / "21 Nov, 11:00 am"
export const formatWhen = (iso) => {
  const date = new Date(iso);
  const time = formatTime(iso);
  const key = dayKeyIn(date);
  const today = new Date();
  const shift = (days) => dayKeyIn(new Date(today.getTime() + days * 86400e3));
  if (key === shift(0)) return `Today, ${time}`;
  if (key === shift(-1)) return `Yesterday, ${time}`;
  if (key === shift(1)) return `Tomorrow, ${time}`;
  const day = date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: OFFICE_TIMEZONE });
  return `${day}, ${time}`;
};

// "98765 43210"
export const formatPhone = (digits) =>
  digits?.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// [1,2,3,4,5,6] -> "Mon–Sat", [1,3,5] -> "Mon, Wed, Fri" (week starts Monday)
export const formatWorkDays = (days = []) => {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const sorted = order.filter((d) => days.includes(d));
  if (!sorted.length) return "No days";
  if (sorted.length === 7) return "Every day";
  // Group consecutive days into ranges
  const groups = [];
  for (const d of sorted) {
    const last = groups.at(-1);
    if (last && order.indexOf(d) === order.indexOf(last.at(-1)) + 1) last.push(d);
    else groups.push([d]);
  }
  return groups
    .map((g) => (g.length >= 3 ? `${DAY_SHORT[g[0]]}–${DAY_SHORT[g.at(-1)]}` : g.map((d) => DAY_SHORT[d]).join(", ")))
    .join(", ");
};

// "09:30" + 15 -> "09:45"
export const addMinutes = (hm, minutes) => {
  const [h, m] = hm.split(":").map(Number);
  const total = h * 60 + m + Number(minutes || 0);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

// One line: "9:30 am – 6:30 pm · late after 9:45 am · Mon–Sat"
export const formatSchedule = (s) =>
  s ? `${formatClock(s.officeStart)} – ${formatClock(s.officeEnd)} · late after ${formatClock(s.lateAfter)} · ${formatWorkDays(s.workDays)}` : "";

// "2026-10-05" -> "5 Oct 2026"
export const formatDate = (key) =>
  key
    ? new Date(`${key}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "—";

// 45000 -> "₹45,000"
export const formatMoney = (n) => (n == null || n === "" ? "—" : `₹${Number(n).toLocaleString("en-IN")}`);
