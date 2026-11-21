import Attendance from "../models/Attendance.js";
import Lead, { CLOSED_STATUSES } from "../models/Lead.js";
import User, { ROLES } from "../models/User.js";
import WorkItem, { CLOSED_WORK_STATUSES } from "../models/WorkItem.js";
import { loadHolidays } from "../models/Holiday.js";
import { loadLeaves } from "../models/LeaveRequest.js";
import { countedDays, statusFor, summarise } from "../controllers/attendanceController.js";
import AppError from "./AppError.js";
import { dateKey, daysInMonth, endOfDay, monthKey, startOfDay } from "./time.js";
import { callStats, inRange, leadEvents, workEvents, workStats } from "./activityEvents.js";

const PERFORMANCE_MONTHS = 6;

// "2026-11" + (-2) -> "2026-09"
const shiftMonth = (month, delta) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};
const lastDayOf = (month) => daysInMonth(month).at(-1);

const sessionList = (record) => (record ? record.allSessions().map((s) => ({ in: s.in, out: s.out })) : []);

// Everything an admin needs about one employee: overview, attendance,
// day-by-day work, leads/work pipeline, 6-month performance and a timeline.
export async function buildEmployeeProfile(userId, month) {
  const user = await User.findById(userId);
  if (!user) throw new AppError("Employee not found", 404);

  const id = String(user._id);
  const today = dateKey();
  const now = new Date();
  const joined = dateKey(user.createdAt);
  const isTelecaller = user.role === ROLES.TELECALLER;
  const isMarketer = user.role === ROLES.DIGITAL_MARKETING;

  // Performance window: the chosen month and the 5 before it
  const months = Array.from({ length: PERFORMANCE_MONTHS }, (_, i) =>
    shiftMonth(month, i - (PERFORMANCE_MONTHS - 1))
  );
  const from = startOfDay(`${months[0]}-01`);
  const to = endOfDay(lastDayOf(month));

  const [records, leads, items, todayRecord, holidays, leaveMap] = await Promise.all([
    Attendance.find({ user: user._id, date: { $gte: `${months[0]}-01`, $lte: lastDayOf(month) } }),
    isTelecaller
      ? Lead.find({
          owner: user._id,
          $or: [
            { "activity.at": { $gte: from, $lte: to } },
            { createdAt: { $gte: from, $lte: to } },
            { lastContactedAt: { $gte: from, $lte: to } },
          ],
        })
      : [],
    isMarketer ? WorkItem.find({ owner: user._id, "updates.at": { $gte: from, $lte: to } }) : [],
    Attendance.findOne({ user: user._id, date: today }),
    // Covers the 6-month window and today
    loadHolidays(`${months[0]}-01`, today > lastDayOf(month) ? today : lastDayOf(month)),
    loadLeaves([user._id], `${months[0]}-01`, today > lastDayOf(month) ? today : lastDayOf(month)),
  ]);
  const leaves = leaveMap.get(id) || new Map();

  // Only this person's own actions
  const calls = leadEvents(leads, from, to).filter((e) => e.userId === id);
  const work = workEvents(items, from, to);

  /* ---------- Performance: one row per month ---------- */
  const performance = months.map((m) => {
    const mFrom = startOfDay(`${m}-01`);
    const mTo = endOfDay(lastDayOf(m));
    const row = {
      month: m,
      beforeJoining: lastDayOf(m) < joined,
      future: m > monthKey(),
      ...summarise(countedDays(m, user, today), records.filter((r) => r.date.startsWith(m)), today, holidays, user, leaves),
    };
    if (isTelecaller) {
      const c = callStats(calls.filter((e) => inRange(e.at, mFrom, mTo)));
      row.calls = { ...c, conversionRate: c.leadsCalled ? Math.round((c.converted / c.leadsCalled) * 100) : null };
    }
    if (isMarketer) {
      const w = workStats(work.filter((e) => inRange(e.at, mFrom, mTo)), items, mFrom, mTo);
      row.work = { ...w, winRate: w.won + w.lost ? Math.round((w.won / (w.won + w.lost)) * 100) : null };
    }
    return row;
  });

  /* ---------- Chosen month, day by day (newest first) ---------- */
  const recordByDate = new Map(records.map((r) => [r.date, r]));
  const days = countedDays(month, user, today)
    .reverse()
    .map((date) => {
      const record = recordByDate.get(date) || null;
      const dFrom = startOfDay(date);
      const dTo = endOfDay(date);
      const running =
        date === today && record?.activeSince ? Math.round((now - record.activeSince) / 60000) : 0;
      const day = {
        date,
        status: statusFor(date, record, today, holidays, user, leaves),
        firstIn: record?.checkIn || null,
        lastOut: record?.checkOut || null,
        working: date === today && Boolean(record?.activeSince),
        sessions: sessionList(record),
        workMinutes: record ? record.workMinutes + running : 0,
      };
      if (isTelecaller) day.calls = callStats(calls.filter((e) => inRange(e.at, dFrom, dTo)));
      if (isMarketer) day.work = workStats(work.filter((e) => inRange(e.at, dFrom, dTo)), items, dFrom, dTo);
      return day;
    });

  /* ---------- Activity timeline for the chosen month (newest first) ---------- */
  const mFrom = startOfDay(`${month}-01`);
  const activity = [];
  for (const r of records.filter((r) => r.date.startsWith(month))) {
    r.allSessions().forEach((s, i) => {
      activity.push({ type: "clock_in", at: s.in, session: i + 1, late: i === 0 && r.status === "late" });
      if (s.out) {
        activity.push({ type: "clock_out", at: s.out, session: i + 1, minutes: Math.round((s.out - s.in) / 60000) });
      }
    });
  }
  for (const e of calls) if (inRange(e.at, mFrom, to)) activity.push({ type: "lead", ...e });
  for (const e of work) if (inRange(e.at, mFrom, to)) activity.push({ type: "work", ...e });
  if (inRange(user.createdAt, mFrom, to)) activity.push({ type: "joined", at: user.createdAt });
  activity.sort((a, b) => b.at - a.at);

  /* ---------- Pipeline (all time, not month-bound) ---------- */
  let pipeline = null;
  if (isTelecaller) {
    const [byStatus, followUps, recentLeads] = await Promise.all([
      Lead.aggregate([{ $match: { owner: user._id } }, { $group: { _id: "$callStatus", n: { $sum: 1 } } }]),
      Lead.find({ owner: user._id, followUpAt: { $ne: null }, callStatus: { $nin: CLOSED_STATUSES } })
        .sort({ followUpAt: 1 })
        .limit(25),
      Lead.find({ owner: user._id }).sort({ updatedAt: -1 }).limit(15),
    ]);
    const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.n]));
    pipeline = {
      kind: "leads",
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      byStatus: counts,
      followUps,
      overdue: followUps.filter((l) => l.followUpAt < now).length,
      recentLeads,
    };
  }
  if (isMarketer) {
    const [byStatus, byCategory, open, recentClosed] = await Promise.all([
      WorkItem.aggregate([{ $match: { owner: user._id } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
      WorkItem.aggregate([{ $match: { owner: user._id } }, { $group: { _id: "$category", n: { $sum: 1 } } }]),
      WorkItem.find({ owner: user._id, status: { $nin: CLOSED_WORK_STATUSES } })
        .sort({ dueDate: 1, createdAt: 1 })
        .limit(25)
        .populate("assignedBy", "firstName lastName"),
      WorkItem.find({ owner: user._id, closedAt: { $ne: null } })
        .sort({ closedAt: -1 })
        .limit(15)
        .populate("assignedBy", "firstName lastName"),
    ]);
    const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.n]));
    pipeline = {
      kind: "work",
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      byStatus: counts,
      byCategory: Object.fromEntries(byCategory.map((s) => [s._id, s.n])),
      open,
      overdue: open.filter((i) => i.dueDate && i.dueDate < now).length,
      recentClosed,
    };
  }

  /* ---------- Overview ---------- */
  const todayRunning = todayRecord?.activeSince ? Math.round((now - todayRecord.activeSince) / 60000) : 0;
  const overview = {
    today:
      joined <= today && user.isActive !== false
        ? {
            status: statusFor(today, todayRecord, today, holidays, user, leaves),
            firstIn: todayRecord?.checkIn || null,
            lastOut: todayRecord?.checkOut || null,
            working: Boolean(todayRecord?.activeSince),
            sessions: sessionList(todayRecord).length,
            workMinutes: todayRecord ? todayRecord.workMinutes + todayRunning : 0,
          }
        : null,
    month: performance.at(-1),
  };

  return {
    user,
    month,
    joined,
    today,
    // Holidays in the chosen month, for the calendar
    holidays: [...holidays].filter(([d]) => d.startsWith(month)).map(([date, name]) => ({ date, name })),
    leaves: [...leaves].filter(([d]) => d.startsWith(month)).map(([date, l]) => ({ date, ...l })),
    hasClockIn: isTelecaller || isMarketer, // admins don't clock in
    overview,
    performance,
    days,
    activity,
    pipeline,
  };
}
