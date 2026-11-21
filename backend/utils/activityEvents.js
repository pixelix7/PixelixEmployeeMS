// Turns lead and work-item history into time-stamped events, and counts them.
// Shared by the daily report and the employee profile so both agree.
import { CALL_STATUS } from "../models/Lead.js";
import { WORK_STATUS } from "../models/WorkItem.js";

export const DONE_WORK = [WORK_STATUS.COMPLETED, WORK_STATUS.WON, WORK_STATUS.LOST];

export const inRange = (date, from, to) => Boolean(date) && date >= from && date <= to;

// Every add / call update on these leads between `from` and `to`.
// Leads from before the activity log fall back to createdAt / lastContactedAt.
export function leadEvents(leads, from, to) {
  const events = [];
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
        events.push({
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
      if (inRange(lead.createdAt, from, to)) {
        events.push({ ...base, kind: "added", at: lead.createdAt, status: lead.callStatus, note: lead.notes, followUpAt: lead.followUpAt });
      }
      if (inRange(lead.lastContactedAt, from, to) && lead.lastContactedAt - lead.createdAt > 1000) {
        events.push({ ...base, kind: "update", at: lead.lastContactedAt, status: lead.callStatus, statusChanged: true, note: lead.notes, followUpAt: lead.followUpAt });
      }
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

// Every status change / note on these work items between `from` and `to`
export function workEvents(items, from, to) {
  const events = [];
  for (const item of items) {
    for (const u of item.updates) {
      if (!inRange(u.at, from, to)) continue;
      events.push({
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
  return events.sort((a, b) => a.at - b.at);
}

// Telecaller numbers from their lead events
export function callStats(events) {
  // A "call" = any update, or adding a lead that was already called
  const calls = events.filter((e) => e.kind === "update" || e.status !== CALL_STATUS.NEW);
  const changedTo = (status) =>
    new Set(
      events
        .filter((e) => e.status === status && (e.statusChanged || e.kind === "added"))
        .map((e) => String(e.leadId))
    ).size;
  return {
    leadsAdded: events.filter((e) => e.kind === "added").length,
    callsLogged: calls.length,
    leadsCalled: new Set(calls.map((e) => String(e.leadId))).size,
    interested: changedTo(CALL_STATUS.INTERESTED),
    converted: changedTo(CALL_STATUS.CONVERTED),
    notInterested: changedTo(CALL_STATUS.NOT_INTERESTED),
  };
}

// Digital marketer numbers from their work events + the items closed in the period
export function workStats(events, items, from, to) {
  const byThem = events.filter((e) => e.byOwner);
  const closed = items.filter((i) => inRange(i.closedAt, from, to) && DONE_WORK.includes(i.status));
  return {
    updates: byThem.length,
    itemsWorkedOn: new Set(byThem.map((e) => String(e.itemId))).size,
    closed: closed.length,
    won: closed.filter((i) => i.status === WORK_STATUS.WON).length,
    lost: closed.filter((i) => i.status === WORK_STATUS.LOST).length,
  };
}
