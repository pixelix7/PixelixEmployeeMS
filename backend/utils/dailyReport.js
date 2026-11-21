import Attendance from "../models/Attendance.js";
import Lead, { CLOSED_STATUSES } from "../models/Lead.js";
import User, { ROLES } from "../models/User.js";
import WorkItem from "../models/WorkItem.js";
import { loadHolidays } from "../models/Holiday.js";
import { loadLeaves } from "../models/LeaveRequest.js";
import { activeOn, statusFor } from "../controllers/attendanceController.js";
import { dateKey, endOfDay, startOfDay } from "./time.js";
import { callStats, leadEvents, workEvents as toWorkEvents, workStats } from "./activityEvents.js";

const STAFF_ROLES = [ROLES.TELECALLER, ROLES.DIGITAL_MARKETING];

// Everything that happened on one day, for every telecaller and digital marketer
// (or just one of them when `userId` is given)
export async function buildDailyReport(date, { userId } = {}) {
  const today = dateKey();
  const from = startOfDay(date);
  const to = endOfDay(date);
  const now = new Date();

  // People who had joined by that day
  const users = (
    await User.find({ role: { $in: STAFF_ROLES }, ...(userId && { _id: userId }) }).sort({ firstName: 1, lastName: 1 })
  ).filter((u) => activeOn(u, date));
  const ids = users.map((u) => u._id);

  const [records, leads, dueLeads, workItems, holidays, leaves] = await Promise.all([
    Attendance.find({ date, user: { $in: ids } }),
    // Leads touched that day. Older leads (before the activity log) fall back to
    // createdAt / lastContactedAt.
    Lead.find({
      owner: { $in: ids },
      $or: [
        { "activity.at": { $gte: from, $lte: to } },
        { createdAt: { $gte: from, $lte: to } },
        { lastContactedAt: { $gte: from, $lte: to } },
      ],
    }),
    // Follow-ups that were due that day
    Lead.find({ owner: { $in: ids }, followUpAt: { $gte: from, $lte: to } }).select(
      "owner callStatus followUpAt lastContactedAt"
    ),
    WorkItem.find({ owner: { $in: ids }, "updates.at": { $gte: from, $lte: to } }),
    loadHolidays(date, date),
    loadLeaves(ids, date, date),
  ]);

  const callEvents = leadEvents(leads, from, to);
  const workEvents = toWorkEvents(workItems, from, to);

  /* ---------- One row per employee ---------- */
  const recordByUser = new Map(records.map((r) => [String(r.user), r]));

  const rows = users.map((user) => {
    const id = String(user._id);
    const record = recordByUser.get(id) || null;
    const sessions = record ? record.allSessions() : [];
    // Today, count the running session too
    const running =
      date === today && record?.activeSince ? Math.round((now - record.activeSince) / 60000) : 0;

    const row = {
      user,
      attendance: {
        status: statusFor(date, record, today, holidays, user, leaves.get(id)),
        firstIn: record?.checkIn || null,
        lastOut: record?.checkOut || null,
        working: Boolean(record?.activeSince) && date === today,
        sessions: sessions.length,
        workMinutes: record ? record.workMinutes + running : 0,
      },
      sessions: sessions.map((s) => ({ in: s.in, out: s.out })),
    };

    if (user.role === ROLES.TELECALLER) {
      const due = dueLeads.filter((l) => String(l.owner) === id);
      row.telecaller = {
        ...callStats(callEvents.filter((e) => e.userId === id)),
        followUpsDue: due.length,
        // Still open and not touched since it was due
        followUpsMissed: due.filter(
          (l) =>
            !CLOSED_STATUSES.includes(l.callStatus) &&
            l.followUpAt < now &&
            !(l.lastContactedAt && l.lastContactedAt >= l.followUpAt)
        ).length,
      };
    }

    if (user.role === ROLES.DIGITAL_MARKETING) {
      const myItems = workItems.filter((i) => String(i.owner) === id);
      row.marketing = {
        ...workStats(workEvents.filter((e) => e.userId === id), myItems, from, to),
        itemsAdded: myItems.filter((i) => i.date === date).length,
      };
    }

    return row;
  });

  /* ---------- Team totals ---------- */
  const sum = (pick) => rows.reduce((n, r) => n + (pick(r) || 0), 0);
  const att = (s) => rows.filter((r) => r.attendance.status === s).length;

  return {
    date,
    isToday: date === today,
    holiday: holidays.get(date) || null,
    summary: {
      employees: rows.length,
      present: rows.filter((r) => r.sessions.length).length,
      late: rows.filter((r) => recordByUser.get(String(r.user._id))?.status === "late").length,
      halfDays: att("half_day"),
      onLeave: att("leave"),
      absent: att("absent"),
      notIn: att("not_in"),
      workMinutes: sum((r) => r.attendance.workMinutes),
      leadsAdded: sum((r) => r.telecaller?.leadsAdded),
      callsLogged: sum((r) => r.telecaller?.callsLogged),
      interested: sum((r) => r.telecaller?.interested),
      converted: sum((r) => r.telecaller?.converted),
      followUpsMissed: sum((r) => r.telecaller?.followUpsMissed),
      workUpdates: sum((r) => r.marketing?.updates),
      workClosed: sum((r) => r.marketing?.closed),
      workWon: sum((r) => r.marketing?.won),
    },
    rows,
    callEvents,
    workEvents,
  };
}
