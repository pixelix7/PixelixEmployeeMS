import Attendance from "../models/Attendance.js";
import Lead, { CALL_STATUS, CLOSED_STATUSES } from "../models/Lead.js";
import User, { ROLES } from "../models/User.js";
import WorkItem, { WORK_STATUS } from "../models/WorkItem.js";
import { statusFor } from "../controllers/attendanceController.js";
import { dateKey, endOfDay, startOfDay } from "./time.js";

const STAFF_ROLES = [ROLES.TELECALLER, ROLES.DIGITAL_MARKETING];
const DONE_WORK = [WORK_STATUS.COMPLETED, WORK_STATUS.WON, WORK_STATUS.LOST];

const inRange = (date, from, to) => date && date >= from && date <= to;

// Everything that happened on one day, for every telecaller and digital marketer
export async function buildDailyReport(date) {
  const today = dateKey();
  const from = startOfDay(date);
  const to = endOfDay(date);
  const now = new Date();

  // People who had joined by that day
  const users = (
    await User.find({ role: { $in: STAFF_ROLES } }).sort({ firstName: 1, lastName: 1 })
  ).filter((u) => dateKey(u.createdAt) <= date);
  const ids = users.map((u) => u._id);

  const [records, leads, dueLeads, workItems] = await Promise.all([
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
  ]);

  /* ---------- Lead events ---------- */
  const callEvents = [];
  for (const lead of leads) {
    const base = {
      leadId: lead._id,
      userId: String(lead.owner),
      businessName: lead.businessName,
      phone: lead.phone,
      source: lead.source,
    };
    if (lead.activity?.length) {
      for (const a of lead.activity) {
        if (!inRange(a.at, from, to)) continue;
        callEvents.push({
          ...base,
          userId: String(a.by || lead.owner),
          kind: a.kind,
          at: a.at,
          status: a.status,
          statusChanged: a.statusChanged,
          note: a.note,
          followUpAt: a.followUpAt,
        });
      }
    } else {
      // Legacy lead: we only know when it was added and last contacted
      if (inRange(lead.createdAt, from, to)) {
        callEvents.push({ ...base, kind: "added", at: lead.createdAt, status: lead.callStatus, note: lead.notes, followUpAt: lead.followUpAt });
      }
      if (inRange(lead.lastContactedAt, from, to) && lead.lastContactedAt - lead.createdAt > 1000) {
        callEvents.push({ ...base, kind: "update", at: lead.lastContactedAt, status: lead.callStatus, statusChanged: true, note: lead.notes, followUpAt: lead.followUpAt });
      }
    }
  }
  callEvents.sort((a, b) => a.at - b.at);

  /* ---------- Work events ---------- */
  const workEvents = [];
  for (const item of workItems) {
    for (const u of item.updates) {
      if (!inRange(u.at, from, to)) continue;
      workEvents.push({
        itemId: item._id,
        userId: String(item.owner),
        byOwner: String(u.by) === String(item.owner),
        at: u.at,
        category: item.category,
        title: item.title,
        client: item.client,
        status: u.status, // null = note only
        note: u.note,
        assigned: Boolean(item.assignedBy),
      });
    }
  }
  workEvents.sort((a, b) => a.at - b.at);

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
        status: statusFor(date, record, today),
        firstIn: record?.checkIn || null,
        lastOut: record?.checkOut || null,
        working: Boolean(record?.activeSince) && date === today,
        sessions: sessions.length,
        workMinutes: record ? record.workMinutes + running : 0,
      },
      sessions: sessions.map((s) => ({ in: s.in, out: s.out })),
    };

    if (user.role === ROLES.TELECALLER) {
      const mine = callEvents.filter((e) => e.userId === id);
      // A "call" = any update, or adding a lead that was already called
      const calls = mine.filter((e) => e.kind === "update" || e.status !== CALL_STATUS.NEW);
      const changedTo = (status) =>
        new Set(
          mine
            .filter((e) => e.status === status && (e.statusChanged || e.kind === "added"))
            .map((e) => String(e.leadId))
        ).size;
      const due = dueLeads.filter((l) => String(l.owner) === id);
      row.telecaller = {
        leadsAdded: mine.filter((e) => e.kind === "added").length,
        callsLogged: calls.length,
        leadsCalled: new Set(calls.map((e) => String(e.leadId))).size,
        interested: changedTo(CALL_STATUS.INTERESTED),
        converted: changedTo(CALL_STATUS.CONVERTED),
        notInterested: changedTo(CALL_STATUS.NOT_INTERESTED),
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
      const mine = workEvents.filter((e) => e.userId === id);
      const byThem = mine.filter((e) => e.byOwner);
      const closedItems = workItems.filter(
        (i) => String(i.owner) === id && inRange(i.closedAt, from, to) && DONE_WORK.includes(i.status)
      );
      row.marketing = {
        updates: byThem.length,
        itemsWorkedOn: new Set(byThem.map((e) => String(e.itemId))).size,
        itemsAdded: workItems.filter((i) => String(i.owner) === id && i.date === date).length,
        closed: closedItems.length,
        won: closedItems.filter((i) => i.status === WORK_STATUS.WON).length,
        lost: closedItems.filter((i) => i.status === WORK_STATUS.LOST).length,
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
    summary: {
      employees: rows.length,
      present: att("present") + att("late"),
      late: att("late"),
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
