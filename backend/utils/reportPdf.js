import PDFDocument from "pdfkit";
import { ROLE_LABELS, STATUS_LABELS } from "./monthlyReportXlsx.js";
import { CALL_STATUS_LABELS, SOURCE_LABELS, WORK_CATEGORY_LABELS, WORK_STATUS_LABELS } from "./dailyReportXlsx.js";

/* ---------- Theme (matches the app) ---------- */
const C = {
  ink: "#1d1512",
  soft: "#6b5b54",
  faint: "#9a8a83",
  terra: "#c4623a",
  clay: "#8f3f21",
  cream: "#fbf1e3",
  sand: "#f1c9a5",
  stripe: "#fdf6ee",
  line: "#ead8c8",
  good: "#276749",
  bad: "#b42318",
  amber: "#b45309",
  blue: "#1d4ed8",
  purple: "#6d28d9",
};

const STATUS_COLORS = {
  present: C.good,
  late: C.clay,
  half_day: C.amber,
  absent: C.bad,
  leave: C.purple,
  holiday: C.blue,
  off: C.faint,
  not_in: C.soft,
};

/* ---------- Formatting (office timezone) ---------- */
const tz = () => process.env.TIMEZONE || "Asia/Kolkata";
const time = (d) =>
  d ? new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: tz() }).toLowerCase() : "–";
const dateTime = (d) =>
  new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz() });
const keyDate = (key, opts) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", ...opts });
const longDay = (key) => keyDate(key, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDay = (key) => keyDate(key, { weekday: "short", day: "numeric", month: "short" });
const monthTitle = (month) => keyDate(`${month}-15`, { month: "long", year: "numeric" });
const hours = (m) => (m ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : "–");
const fullName = (u) => `${u.firstName} ${u.lastName}`;
const num = (v) => (v == null ? "–" : String(v));

/* ---------- Drawing helpers ---------- */
const MARGIN = 36;

function createDoc(title) {
  return new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: MARGIN,
    bufferPages: true,
    info: { Title: title, Author: "Pixelix EMS" },
  });
}

const pageWidth = (doc) => doc.page.width - MARGIN * 2;
const bottom = (doc) => doc.page.height - MARGIN - 18; // leave room for the footer

function ensureSpace(doc, height) {
  if (doc.y + height > bottom(doc)) {
    doc.addPage();
    doc.y = MARGIN;
  }
}

function header(doc, title, subtitle, meta) {
  const w = pageWidth(doc);
  doc.rect(0, 0, doc.page.width, 6).fill(C.terra);
  doc.fillColor(C.terra).font("Helvetica-Bold").fontSize(9).text("PIXELIX EMS", MARGIN, MARGIN, { characterSpacing: 1.5 });
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(20).text(title, MARGIN, doc.y + 4, { width: w });
  if (subtitle) doc.fillColor(C.soft).font("Helvetica").fontSize(11).text(subtitle, { width: w });
  doc.fillColor(C.faint).fontSize(8.5).text(meta, { width: w });
  doc.moveDown(0.6);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + w, doc.y).lineWidth(1).strokeColor(C.line).stroke();
  doc.y += 12;
}

// A row of number tiles: [{ label, value, color }]
function stats(doc, items) {
  const w = pageWidth(doc);
  const gap = 8;
  const perRow = Math.min(items.length, 8);
  const tile = (w - gap * (perRow - 1)) / perRow;
  const h = 46;
  // Text calls move doc.y, so place every tile from a fixed row top
  ensureSpace(doc, h);
  let rowTop = doc.y;
  items.forEach((item, i) => {
    if (i && i % perRow === 0) {
      rowTop += h + gap;
      doc.y = rowTop;
      ensureSpace(doc, h);
      rowTop = doc.y;
    }
    const x = MARGIN + (i % perRow) * (tile + gap);
    const y = rowTop;
    doc.roundedRect(x, y, tile, h, 6).fillAndStroke("#ffffff", C.line);
    doc.rect(x, y + 6, 3, h - 12).fill(item.color || C.sand);
    doc.fillColor(item.color || C.ink).font("Helvetica-Bold").fontSize(15).text(String(item.value), x + 10, y + 8, {
      width: tile - 16,
      lineBreak: false,
      ellipsis: true,
    });
    doc.fillColor(C.soft).font("Helvetica").fontSize(8).text(item.label, x + 10, y + 29, { width: tile - 16, lineBreak: false, ellipsis: true });
  });
  doc.y = rowTop + h + 16;
  doc.x = MARGIN;
}

function sectionTitle(doc, text, note) {
  ensureSpace(doc, 50);
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(12.5).text(text, MARGIN, doc.y);
  if (note) doc.fillColor(C.faint).font("Helvetica").fontSize(8.5).text(note);
  doc.y += 6;
}

// columns: [{ header, weight, align }]; rows: arrays of cell values or { text, color, bold }
function table(doc, columns, rows, { empty = "Nothing to show." } = {}) {
  const w = pageWidth(doc);
  const totalWeight = columns.reduce((s, c) => s + (c.weight || 1), 0);
  const widths = columns.map((c) => ((c.weight || 1) / totalWeight) * w);
  const pad = 5;
  const fontSize = 8.5;

  const drawHeader = () => {
    const h = 20;
    ensureSpace(doc, h + 18);
    const y = doc.y;
    doc.rect(MARGIN, y, w, h).fill(C.ink);
    let x = MARGIN;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(C.cream);
    columns.forEach((c, i) => {
      doc.text(c.header, x + pad, y + 6, { width: widths[i] - pad * 2, align: c.align || "left", lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    doc.y = y + h;
  };

  drawHeader();
  if (!rows.length) {
    doc.fillColor(C.faint).font("Helvetica-Oblique").fontSize(9).text(empty, MARGIN + pad, doc.y + 6);
    doc.y += 10;
    doc.x = MARGIN;
    doc.moveDown(0.8);
    return;
  }

  rows.forEach((row, r) => {
    const cells = row.map((v) => (v && typeof v === "object" ? v : { text: v == null ? "–" : String(v) }));
    doc.fontSize(fontSize);
    const h =
      Math.max(
        ...cells.map((c, i) => {
          doc.font(c.bold ? "Helvetica-Bold" : "Helvetica");
          return doc.heightOfString(c.text || "–", { width: widths[i] - pad * 2 });
        })
      ) + 9;
    if (doc.y + h > bottom(doc)) {
      doc.addPage();
      doc.y = MARGIN;
      drawHeader();
    }
    const y = doc.y;
    if (r % 2 === 1) doc.rect(MARGIN, y, w, h).fill(C.stripe);
    doc.moveTo(MARGIN, y + h).lineTo(MARGIN + w, y + h).lineWidth(0.5).strokeColor(C.line).stroke();
    let x = MARGIN;
    cells.forEach((c, i) => {
      doc
        .fillColor(c.color || C.ink)
        .font(c.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(fontSize)
        .text(c.text || "–", x + pad, y + 4.5, { width: widths[i] - pad * 2, align: columns[i].align || "left" });
      x += widths[i];
    });
    doc.y = y + h;
  });
  doc.x = MARGIN;
  doc.y += 16;
}

function footers(doc, label) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - MARGIN + 4;
    // Writing below the bottom margin would add a page; lift the margin for the footer
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor(C.faint).font("Helvetica").fontSize(8);
    doc.text(label, MARGIN, y, { width: pageWidth(doc) / 2, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, MARGIN + pageWidth(doc) / 2, y, {
      width: pageWidth(doc) / 2,
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = oldBottom;
  }
}

const statusCell = (status) => ({ text: STATUS_LABELS[status] || status, color: STATUS_COLORS[status] || C.ink, bold: true });
const rateCell = (rate) =>
  rate == null ? "–" : { text: `${rate}%`, bold: true, color: rate >= 90 ? C.good : rate >= 70 ? C.clay : C.bad };
const generated = (by) =>
  `Generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: tz() })} by ${by || "admin"}`;

/* =====================================================================
   Daily report
   ===================================================================== */
export function dailyReportPdf(report, { generatedBy, scope } = {}) {
  const single = report.rows.length === 1 && scope;
  const title = `Daily Report — ${longDay(report.date)}`;
  const doc = createDoc(title);
  const s = report.summary;
  const person = single ? report.rows[0] : null;

  header(
    doc,
    title,
    single ? `${fullName(person.user)} · ${ROLE_LABELS[person.user.role]} · ${person.user.email}` : `All employees (${s.employees})`,
    `${generated(generatedBy)}${report.isToday ? " · Today's figures are live and may still change" : ""}${
      report.holiday ? ` · Holiday: ${report.holiday}` : ""
    }`
  );

  if (single) {
    const a = person.attendance;
    const t = person.telecaller;
    const m = person.marketing;
    stats(doc, [
      { label: "Attendance", value: STATUS_LABELS[a.status] || a.status, color: STATUS_COLORS[a.status] },
      { label: "First in", value: time(a.firstIn) },
      { label: "Last out", value: a.lastOut ? time(a.lastOut) : a.working ? "Working" : "–" },
      { label: "Worked", value: hours(a.workMinutes) },
      { label: "Sessions", value: a.sessions },
      ...(t
        ? [
            { label: "Calls logged", value: t.callsLogged },
            { label: "Leads added", value: t.leadsAdded },
            { label: "Converted", value: t.converted, color: t.converted ? C.good : undefined },
          ]
        : []),
      ...(m
        ? [
            { label: "Work updates", value: m.updates },
            { label: "Items closed", value: m.closed },
            { label: "Won", value: m.won, color: m.won ? C.good : undefined },
          ]
        : []),
    ]);

    sectionTitle(doc, "Clock-in sessions");
    table(
      doc,
      [{ header: "Session", weight: 1 }, { header: "Clock in", weight: 2 }, { header: "Clock out", weight: 2 }, { header: "Duration", weight: 2 }],
      person.sessions.map((x, i) => [
        `#${i + 1}`,
        time(x.in),
        x.out ? time(x.out) : "Working",
        x.out ? hours(Math.round((new Date(x.out) - new Date(x.in)) / 60000)) : "–",
      ]),
      { empty: "No clock-ins on this day." }
    );

    if (t) {
      sectionTitle(doc, "Telecalling numbers");
      table(
        doc,
        ["Leads added", "Calls logged", "Leads called", "Interested", "Converted", "Not interested", "Follow-ups due", "Follow-ups missed"].map(
          (h) => ({ header: h, align: "center" })
        ),
        [[t.leadsAdded, t.callsLogged, t.leadsCalled, t.interested, t.converted, t.notInterested, t.followUpsDue, { text: num(t.followUpsMissed), color: t.followUpsMissed ? C.bad : C.ink, bold: Boolean(t.followUpsMissed) }]]
      );
    }
  } else {
    stats(doc, [
      { label: "Present", value: `${s.present} / ${s.employees}`, color: C.good },
      { label: "Late", value: s.late, color: s.late ? C.clay : undefined },
      { label: "Half days", value: s.halfDays },
      { label: "On leave", value: s.onLeave, color: s.onLeave ? C.purple : undefined },
      report.isToday
        ? { label: "Not in yet", value: s.notIn }
        : { label: "Absent", value: s.absent, color: s.absent ? C.bad : undefined },
      { label: "Hours worked", value: hours(s.workMinutes) },
      { label: "Calls logged", value: s.callsLogged },
      { label: "Marketing updates", value: s.workUpdates },
    ]);

    sectionTitle(doc, "Attendance");
    table(
      doc,
      [
        { header: "#", weight: 0.5, align: "center" },
        { header: "Employee", weight: 3 },
        { header: "Role", weight: 2 },
        { header: "Status", weight: 1.6 },
        { header: "First in", weight: 1.4, align: "center" },
        { header: "Last out", weight: 1.4, align: "center" },
        { header: "Sessions", weight: 1, align: "center" },
        { header: "Worked", weight: 1.3, align: "center" },
      ],
      report.rows.map((r, i) => [
        i + 1,
        { text: fullName(r.user), bold: true },
        ROLE_LABELS[r.user.role],
        statusCell(r.attendance.status),
        time(r.attendance.firstIn),
        r.attendance.lastOut ? time(r.attendance.lastOut) : r.attendance.working ? "Working" : "–",
        r.attendance.sessions || "–",
        hours(r.attendance.workMinutes),
      ]),
      { empty: "No employees on this day." }
    );

    const callers = report.rows.filter((r) => r.telecaller);
    if (callers.length) {
      sectionTitle(doc, "Telecaller activity");
      table(
        doc,
        [
          { header: "Employee", weight: 3 },
          ...["Leads added", "Calls", "Leads called", "Interested", "Converted", "Not interested", "Follow-ups due", "Missed"].map((h) => ({
            header: h,
            align: "center",
          })),
        ],
        callers.map((r) => {
          const t = r.telecaller;
          return [
            { text: fullName(r.user), bold: true },
            t.leadsAdded,
            t.callsLogged,
            t.leadsCalled,
            t.interested,
            { text: num(t.converted), color: t.converted ? C.good : C.ink, bold: Boolean(t.converted) },
            t.notInterested,
            t.followUpsDue,
            { text: num(t.followUpsMissed), color: t.followUpsMissed ? C.bad : C.ink, bold: Boolean(t.followUpsMissed) },
          ];
        })
      );
    }

    const marketers = report.rows.filter((r) => r.marketing);
    if (marketers.length) {
      sectionTitle(doc, "Digital marketing activity");
      table(
        doc,
        [
          { header: "Employee", weight: 3 },
          ...["Items added", "Updates", "Items worked on", "Closed", "Won", "Lost"].map((h) => ({ header: h, align: "center" })),
        ],
        marketers.map((r) => {
          const m = r.marketing;
          return [{ text: fullName(r.user), bold: true }, m.itemsAdded, m.updates, m.itemsWorkedOn, m.closed, { text: num(m.won), color: m.won ? C.good : C.ink }, m.lost];
        })
      );
    }
  }

  // Detailed logs (both views)
  const people = new Map(report.rows.map((r) => [String(r.user._id), r.user]));
  const who = (id) => (people.get(id) ? fullName(people.get(id)) : "—");

  if (report.callEvents.length) {
    sectionTitle(doc, "Call log", `${report.callEvents.length} entries, in order`);
    table(
      doc,
      [
        { header: "Time", weight: 1 },
        ...(single ? [] : [{ header: "Telecaller", weight: 1.8 }]),
        { header: "Business / Brand", weight: 2.4 },
        { header: "Phone", weight: 1.4 },
        { header: "Source", weight: 1.1 },
        { header: "Status", weight: 1.6 },
        { header: "Notes", weight: 4 },
        { header: "Next follow-up", weight: 1.6 },
      ],
      report.callEvents.map((e) => [
        time(e.at),
        ...(single ? [] : [who(e.userId)]),
        e.businessName,
        e.phone,
        SOURCE_LABELS[e.source] || e.source,
        e.kind === "added" && e.status === "new"
          ? { text: "Lead added", color: C.soft }
          : {
              text: `${e.kind === "added" ? "Added · " : ""}${CALL_STATUS_LABELS[e.status] || e.status}`,
              color: e.status === "converted" ? C.good : C.ink,
            },
        e.note || "",
        e.followUpAt ? dateTime(e.followUpAt) : "",
      ])
    );
  }

  if (report.workEvents.length) {
    sectionTitle(doc, "Marketing work log", `${report.workEvents.length} updates, in order`);
    table(
      doc,
      [
        { header: "Time", weight: 1 },
        ...(single ? [] : [{ header: "Team member", weight: 1.8 }]),
        { header: "Type", weight: 1.7 },
        { header: "Work", weight: 3 },
        { header: "Client", weight: 1.6 },
        { header: "Status", weight: 1.5 },
        { header: "Notes", weight: 3.4 },
      ],
      report.workEvents.map((e) => [
        time(e.at),
        ...(single ? [] : [who(e.userId)]),
        WORK_CATEGORY_LABELS[e.category] || e.category,
        e.title,
        e.client || "",
        e.status ? WORK_STATUS_LABELS[e.status] || e.status : "Note",
        e.note || "",
      ])
    );
  }

  footers(doc, `Daily Report · ${shortDay(report.date)}${single ? ` · ${fullName(person.user)}` : ""}`);
  return doc;
}

/* =====================================================================
   Monthly report
   ===================================================================== */
export function monthlyReportPdf(report, { generatedBy, scope } = {}) {
  const single = report.rows.length === 1 && scope;
  const title = `Monthly Attendance Report — ${monthTitle(report.month)}`;
  const doc = createDoc(title);
  const s = report.summary;
  const person = single ? report.rows[0] : null;

  header(
    doc,
    title,
    single ? `${fullName(person.user)} · ${ROLE_LABELS[person.user.role]} · ${person.user.email}` : `All employees (${s.employees})`,
    `${generated(generatedBy)} · ${report.workingDays} work days so far · Half day = 0.5 in attendance %`
  );

  if (single) {
    const r = person;
    stats(doc, [
      { label: "Attendance", value: r.attendanceRate == null ? "–" : `${r.attendanceRate}%`, color: rateCell(r.attendanceRate).color },
      { label: "Present days", value: r.present, color: C.good },
      { label: "On time", value: r.onTime },
      { label: "Late", value: r.late, color: r.late ? C.clay : undefined },
      { label: "Half days", value: r.halfDays },
      { label: "Absent", value: r.absent, color: r.absent ? C.bad : undefined },
      { label: "Leave days", value: r.leaveDays, color: r.leaveDays ? C.purple : undefined },
      { label: "Hours worked", value: hours(r.workMinutes) },
    ]);

    sectionTitle(doc, "Day by day", `Average ${hours(r.avgWorkMinutes)} per completed day · ${r.holidays} holiday${r.holidays === 1 ? "" : "s"}`);
    table(
      doc,
      [
        { header: "Date", weight: 1.6 },
        { header: "Status", weight: 1.6 },
        { header: "First in", weight: 1.3, align: "center" },
        { header: "Last out", weight: 1.3, align: "center" },
        { header: "Sessions", weight: 1, align: "center" },
        { header: "Worked", weight: 1.2, align: "center" },
      ],
      r.days.map((d) => [
        shortDay(d.date),
        statusCell(d.status),
        d.record ? time(d.record.checkIn) : "–",
        d.record?.checkOut ? time(d.record.checkOut) : d.record ? "Working" : "–",
        d.record ? d.record.sessionCount : "–",
        d.record ? hours(d.record.workMinutes) : "–",
      ]),
      { empty: "No days to show yet for this month." }
    );
  } else {
    stats(doc, [
      { label: "Employees", value: s.employees },
      { label: "Work days so far", value: report.workingDays },
      { label: "Present days", value: s.present, color: C.good },
      { label: "Late arrivals", value: s.late, color: s.late ? C.clay : undefined },
      { label: "Half days", value: s.halfDays },
      { label: "Leave days", value: s.leaveDays, color: s.leaveDays ? C.purple : undefined },
      { label: "Absent days", value: s.absent, color: s.absent ? C.bad : undefined },
      { label: "Hours worked", value: hours(s.workMinutes) },
    ]);

    sectionTitle(doc, "Summary by employee");
    table(
      doc,
      [
        { header: "#", weight: 0.5, align: "center" },
        { header: "Employee", weight: 2.8 },
        { header: "Role", weight: 1.9 },
        ...["Present", "On time", "Late", "Half", "Absent", "Leave", "Holidays"].map((h) => ({ header: h, align: "center" })),
        { header: "Hours", weight: 1.3, align: "center" },
        { header: "Avg / day", weight: 1.3, align: "center" },
        { header: "Attendance", weight: 1.2, align: "center" },
      ],
      report.rows.map((r, i) => [
        i + 1,
        { text: fullName(r.user), bold: true },
        ROLE_LABELS[r.user.role],
        r.present,
        r.onTime,
        { text: num(r.late), color: r.late ? C.clay : C.ink },
        r.halfDays,
        { text: num(r.absent), color: r.absent ? C.bad : C.ink, bold: Boolean(r.absent) },
        r.leaveDays,
        r.holidays,
        hours(r.workMinutes),
        hours(r.avgWorkMinutes),
        rateCell(r.attendanceRate),
      ]),
      { empty: "No employees in this month." }
    );
  }

  if (report.holidays.length) {
    sectionTitle(doc, "Holidays this month");
    table(
      doc,
      [{ header: "Date", weight: 1 }, { header: "Holiday", weight: 4 }],
      report.holidays.map((h) => [shortDay(h.date), h.name])
    );
  }

  footers(doc, `Monthly Report · ${monthTitle(report.month)}${single ? ` · ${fullName(person.user)}` : ""}`);
  return doc;
}

// Stream a finished PDF document to the response
export function sendPdf(res, doc, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.end();
}
