import ExcelJS from "exceljs";
import {
  CLAY,
  CREAM,
  INK,
  ROLE_LABELS,
  SAND_LIGHT,
  STATUS_FILLS,
  STATUS_LABELS,
  TERRA,
  addTitle,
  duration,
  keyToDate,
  officeDate,
  styleHeader,
} from "./monthlyReportXlsx.js";

const CALL_STATUS_LABELS = {
  new: "New (not called)",
  no_answer: "No answer",
  busy: "Busy",
  call_back: "Call back",
  interested: "Interested",
  not_interested: "Not interested",
  converted: "Converted",
  invalid: "Wrong number",
};

const SOURCE_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  amazon: "Amazon",
  flipkart: "Flipkart",
  other: "Other",
};

const WORK_CATEGORY_LABELS = {
  audit_demo: "Audit / Demo",
  creative_design: "Creative / Design",
  campaign_post: "Campaign / Post",
  client_followup: "Client / Lead Follow-up",
  assigned_task: "Assigned Task",
};

const WORK_STATUS_LABELS = {
  pending: "To do",
  in_progress: "In progress",
  completed: "Completed",
  closed_won: "Closed – Won",
  closed_lost: "Closed – Lost",
  cancelled: "Cancelled",
};

const GOOD = "FF276749";
const BAD = "FFB42318";

const fullName = (u) => `${u.firstName} ${u.lastName}`;

const longDay = (key) =>
  keyToDate(key).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

// Adds a sheet with title rows, a styled header on row 4, frozen panes and filters
function makeSheet(wb, name, title, subtitle, columns, tabColor) {
  const sheet = wb.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 4, xSplit: 1 }],
    properties: { tabColor: { argb: tabColor } },
  });
  addTitle(sheet, title, subtitle, columns.length);
  columns.forEach((c, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = c.width;
    if (c.numFmt) col.numFmt = c.numFmt;
  });
  const header = sheet.getRow(4);
  header.values = columns.map((c) => c.header);
  styleHeader(header);
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } };
  return sheet;
}

const stripe = (row, index) => {
  if (index % 2 === 1) {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SAND_LIGHT } };
    });
  }
};

const emptyNote = (sheet, text, width) => {
  const row = sheet.addRow([text]);
  sheet.mergeCells(row.number, 1, row.number, width);
  row.getCell(1).font = { italic: true, color: { argb: "FF6B5B54" } };
};

export function dailyReportWorkbook(report, { generatedBy } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = generatedBy || "EMS";
  wb.created = new Date();

  const day = longDay(report.date);
  const generatedOn = officeDate(new Date()).toISOString().slice(0, 16).replace("T", " ");
  const subtitle =
    `Generated ${generatedOn} by ${generatedBy || "admin"}` +
    (report.isToday ? " · Today's figures are live and may still change" : "");
  const people = new Map(report.rows.map((r) => [String(r.user._id), r.user]));

  /* ---------------- Summary: one row per employee ---------------- */
  const columns = [
    { header: "S.No", width: 6 },
    { header: "Employee Name", width: 22 },
    { header: "Email", width: 28 },
    { header: "Phone", width: 13 },
    { header: "Role", width: 17 },
    { header: "Attendance", width: 12 },
    { header: "First In", width: 11, numFmt: "h:mm AM/PM" },
    { header: "Last Out", width: 11, numFmt: "h:mm AM/PM" },
    { header: "Sessions", width: 9 },
    { header: "Worked", width: 9, numFmt: "[h]:mm" },
    { header: "Leads Added", width: 10 },
    { header: "Calls Logged", width: 10 },
    { header: "Leads Called", width: 10 },
    { header: "Interested", width: 10 },
    { header: "Converted", width: 10 },
    { header: "Not Interested", width: 10 },
    { header: "Follow-ups Due", width: 10 },
    { header: "Follow-ups Missed", width: 10 },
    { header: "Work Updates", width: 10 },
    { header: "Items Worked On", width: 10 },
    { header: "Items Closed", width: 10 },
    { header: "Won", width: 7 },
    { header: "Lost", width: 7 },
  ];
  const summary = makeSheet(wb, "Summary", `Daily Report — ${day}`, subtitle, columns, TERRA);
  summary.views = [{ state: "frozen", ySplit: 4, xSplit: 2 }];

  report.rows.forEach((r, i) => {
    const a = r.attendance;
    const t = r.telecaller || {};
    const m = r.marketing || {};
    const row = summary.addRow([
      i + 1,
      fullName(r.user),
      r.user.email,
      r.user.phone,
      ROLE_LABELS[r.user.role] || r.user.role,
      STATUS_LABELS[a.status] || a.status,
      a.firstIn ? officeDate(a.firstIn) : null,
      a.lastOut ? officeDate(a.lastOut) : a.working ? "Working" : null,
      a.sessions || null,
      a.workMinutes ? duration(a.workMinutes) : null,
      // Telecaller columns (blank for marketers, so totals stay honest)
      r.telecaller ? t.leadsAdded : null,
      r.telecaller ? t.callsLogged : null,
      r.telecaller ? t.leadsCalled : null,
      r.telecaller ? t.interested : null,
      r.telecaller ? t.converted : null,
      r.telecaller ? t.notInterested : null,
      r.telecaller ? t.followUpsDue : null,
      r.telecaller ? t.followUpsMissed : null,
      // Marketing columns
      r.marketing ? m.updates : null,
      r.marketing ? m.itemsWorkedOn : null,
      r.marketing ? m.closed : null,
      r.marketing ? m.won : null,
      r.marketing ? m.lost : null,
    ]);
    stripe(row, i);
    const status = row.getCell(6);
    if (a.status === "absent") status.font = { bold: true, color: { argb: BAD } };
    if (a.status === "late") status.font = { bold: true, color: { argb: CLAY } };
    if (t.converted) row.getCell(15).font = { bold: true, color: { argb: GOOD } };
    if (t.followUpsMissed) row.getCell(18).font = { bold: true, color: { argb: BAD } };
    if (m.won) row.getCell(22).font = { bold: true, color: { argb: GOOD } };
  });

  if (report.rows.length) {
    const first = 5;
    const last = 4 + report.rows.length;
    const sum = (col) => ({ formula: `SUM(${col}${first}:${col}${last})` });
    const s = report.summary;
    const totals = summary.addRow([
      "",
      `Team total (${report.rows.length})`,
      "",
      "",
      "",
      `${s.present} present`,
      null,
      null,
      sum("I"),
      sum("J"),
      ...["K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W"].map(sum),
    ]);
    totals.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
      cell.border = { top: { style: "medium", color: { argb: TERRA } } };
    });
  } else {
    emptyNote(summary, "No telecallers or digital marketers had joined by this day.", columns.length);
  }
  summary.getColumn(1).alignment = { horizontal: "center" };
  for (let c = 6; c <= columns.length; c++) summary.getColumn(c).alignment = { horizontal: "center", wrapText: true };

  summary.addRow([]);
  const note = summary.addRow([
    "",
    "Calls Logged = every call update (plus leads that were added already called). " +
      "Follow-ups Missed = due that day, still open, and not updated since. Blank = not part of that role.",
  ]);
  note.getCell(2).font = { italic: true, size: 9, color: { argb: "FF6B5B54" } };

  /* ---------------- Attendance sessions ---------------- */
  const sessionsSheet = makeSheet(
    wb,
    "Attendance Sessions",
    `Attendance Sessions — ${day}`,
    "Every clock-in / clock-out pair. Absent and off days are listed so nobody is missing.",
    [
      { header: "Employee Name", width: 22 },
      { header: "Role", width: 17 },
      { header: "Attendance", width: 12 },
      { header: "Session", width: 9 },
      { header: "Clock In", width: 12, numFmt: "h:mm AM/PM" },
      { header: "Clock Out", width: 12, numFmt: "h:mm AM/PM" },
      { header: "Duration", width: 10, numFmt: "[h]:mm" },
    ],
    INK
  );
  let sessionIndex = 0;
  for (const r of report.rows) {
    const record = r.attendance;
    const label = STATUS_LABELS[record.status] || record.status;
    const sessions = r.sessions || [];
    if (!sessions.length) {
      const row = sessionsSheet.addRow([fullName(r.user), ROLE_LABELS[r.user.role], label, null, null, null, null]);
      const fill = STATUS_FILLS[record.status];
      if (fill) row.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } }));
      continue;
    }
    sessions.forEach((s, i) => {
      const minutes = s.out ? Math.round((new Date(s.out) - new Date(s.in)) / 60000) : null;
      const row = sessionsSheet.addRow([
        fullName(r.user),
        ROLE_LABELS[r.user.role],
        label,
        i + 1,
        officeDate(s.in),
        s.out ? officeDate(s.out) : "Working",
        duration(minutes),
      ]);
      stripe(row, sessionIndex++);
    });
  }
  for (let c = 3; c <= 7; c++) sessionsSheet.getColumn(c).alignment = { horizontal: "center" };

  /* ---------------- Telecaller calls ---------------- */
  const calls = makeSheet(
    wb,
    "Telecaller Calls",
    `Telecaller Calls — ${day}`,
    "Every lead added or updated that day, in time order.",
    [
      { header: "Time", width: 11, numFmt: "h:mm AM/PM" },
      { header: "Telecaller", width: 20 },
      { header: "Business / Brand", width: 26 },
      { header: "Phone", width: 13 },
      { header: "Source", width: 11 },
      { header: "Action", width: 13 },
      { header: "Call Status", width: 16 },
      { header: "Notes", width: 44 },
      { header: "Next Follow-up", width: 18, numFmt: "dd-mmm h:mm AM/PM" },
    ],
    TERRA
  );
  if (!report.callEvents.length) emptyNote(calls, "No lead activity on this day.", 9);
  report.callEvents.forEach((e, i) => {
    const who = people.get(e.userId);
    const row = calls.addRow([
      officeDate(e.at),
      who ? fullName(who) : "—",
      e.businessName,
      e.phone,
      SOURCE_LABELS[e.source] || e.source,
      e.kind === "added" ? "Lead added" : "Call update",
      CALL_STATUS_LABELS[e.status] || e.status,
      e.note || "",
      e.followUpAt ? officeDate(e.followUpAt) : null,
    ]);
    stripe(row, i);
    row.getCell(8).alignment = { wrapText: true, vertical: "top" };
    if (e.status === "converted") row.getCell(7).font = { bold: true, color: { argb: GOOD } };
    if (e.status === "not_interested" || e.status === "invalid") row.getCell(7).font = { color: { argb: BAD } };
  });

  /* ---------------- Marketing work ---------------- */
  const work = makeSheet(
    wb,
    "Marketing Work",
    `Digital Marketing Work — ${day}`,
    "Every work update and status change that day, in time order.",
    [
      { header: "Time", width: 11, numFmt: "h:mm AM/PM" },
      { header: "Team Member", width: 20 },
      { header: "Type", width: 20 },
      { header: "Work", width: 32 },
      { header: "Client / Brand", width: 20 },
      { header: "Status Change", width: 15 },
      { header: "Notes", width: 44 },
      { header: "Assigned", width: 10 },
    ],
    CLAY
  );
  if (!report.workEvents.length) emptyNote(work, "No marketing work updates on this day.", 8);
  report.workEvents.forEach((e, i) => {
    const who = people.get(e.userId);
    const row = work.addRow([
      officeDate(e.at),
      who ? fullName(who) : "—",
      WORK_CATEGORY_LABELS[e.category] || e.category,
      e.title,
      e.client || "",
      e.status ? WORK_STATUS_LABELS[e.status] || e.status : "Note only",
      e.note || "",
      e.assigned ? "Yes" : "",
    ]);
    stripe(row, i);
    row.getCell(7).alignment = { wrapText: true, vertical: "top" };
    if (e.status === "closed_won" || e.status === "completed") row.getCell(6).font = { bold: true, color: { argb: GOOD } };
    if (e.status === "closed_lost") row.getCell(6).font = { color: { argb: BAD } };
  });

  return wb;
}
