import ExcelJS from "exceljs";

// Brand colours (ARGB) to match the app
export const TERRA = "FFC4623A";
export const CLAY = "FF8F3F21";
export const INK = "FF1D1512";
export const CREAM = "FFFBF1E3";
export const SAND_LIGHT = "FFFBE9D9";

export const ROLE_LABELS = {
  admin: "Admin",
  telecaller: "Telecaller",
  digital_marketing: "Digital Marketing",
};

export const STATUS_LABELS = {
  present: "On time",
  late: "Late",
  absent: "Absent",
  not_in: "Not in yet",
  off: "Off day",
};

// Light row fills so the day sheet can be scanned quickly
export const STATUS_FILLS = {
  late: "FFFDF0DC",
  absent: "FFFBE3E1",
  off: "FFF2F0EE",
};

const timezone = () => process.env.TIMEZONE || "Asia/Kolkata";

// Excel has no timezones: give it the office wall-clock time, as if it were UTC
export const officeDate = (date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(date))
      .map((x) => [x.type, x.value])
  );
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
};

export const keyToDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// Minutes -> Excel duration (fraction of a day), shown with [h]:mm
export const duration = (minutes) => (minutes == null ? null : minutes / 1440);

const monthTitle = (month) =>
  keyToDate(`${month}-15`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

const fullName = (u) => `${u.firstName} ${u.lastName}`;

export const styleHeader = (row) => {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TERRA } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: CLAY } } };
  });
};

export const addTitle = (sheet, title, subtitle, width) => {
  sheet.mergeCells(1, 1, 1, width);
  const t = sheet.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 16, color: { argb: INK } };
  t.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, width);
  const s = sheet.getCell(2, 1);
  s.value = subtitle;
  s.font = { italic: true, size: 10, color: { argb: "FF6B5B54" } };
};

const workDayNames = () => {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (process.env.WORK_DAYS || "1,2,3,4,5,6")
    .split(",")
    .map((d) => names[Number(d.trim())])
    .filter(Boolean)
    .join(", ");
};

export async function monthlyReportWorkbook(report, { generatedBy } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = generatedBy || "EMS";
  wb.created = new Date();

  const title = `Monthly Attendance Report — ${monthTitle(report.month)}`;
  const generatedOn = officeDate(new Date()).toISOString().slice(0, 16).replace("T", " ");
  const subtitle =
    `Generated ${generatedOn} by ${generatedBy || "admin"} · ` +
    `${report.workingDays} work days so far · Work days: ${workDayNames()} · ` +
    `Late after ${process.env.LATE_AFTER || "10:00"}`;

  /* ---------------- Sheet 1: Summary ---------------- */
  const summary = wb.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 4, xSplit: 2 }],
    properties: { tabColor: { argb: TERRA } },
  });

  const columns = [
    { header: "S.No", key: "sno", width: 6 },
    { header: "Employee Name", key: "name", width: 24 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone", key: "phone", width: 14 },
    { header: "Role", key: "role", width: 18 },
    { header: "Joined On", key: "joined", width: 13, style: { numFmt: "dd-mmm-yyyy" } },
    { header: "Present Days", key: "present", width: 10 },
    { header: "On Time", key: "onTime", width: 9 },
    { header: "Late", key: "late", width: 8 },
    { header: "Absent", key: "absent", width: 9 },
    { header: "Working Hours", key: "hours", width: 12, style: { numFmt: "[h]:mm" } },
    { header: "Avg Hours / Day", key: "avg", width: 12, style: { numFmt: "[h]:mm" } },
    { header: "Attendance %", key: "rate", width: 12, style: { numFmt: "0%" } },
  ];

  addTitle(summary, title, subtitle, columns.length);
  // Column widths/formats without exceljs writing its own header in row 1
  columns.forEach((c, i) => {
    const col = summary.getColumn(i + 1);
    col.width = c.width;
    if (c.style) col.numFmt = c.style.numFmt;
  });
  const headerRow = summary.getRow(4);
  headerRow.values = columns.map((c) => c.header);
  styleHeader(headerRow);

  report.rows.forEach((r, i) => {
    const row = summary.addRow([
      i + 1,
      fullName(r.user),
      r.user.email,
      r.user.phone,
      ROLE_LABELS[r.user.role] || r.user.role,
      officeDate(r.user.createdAt),
      r.present,
      r.onTime,
      r.late,
      r.absent,
      duration(r.workMinutes),
      duration(r.avgWorkMinutes),
      r.attendanceRate == null ? null : r.attendanceRate / 100,
    ]);
    if (i % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SAND_LIGHT } };
      });
    }
    // Colour the attendance rate like the app does
    const rate = row.getCell(13);
    if (r.attendanceRate != null) {
      const color = r.attendanceRate >= 90 ? "FF276749" : r.attendanceRate >= 70 ? CLAY : "FFB42318";
      rate.font = { bold: true, color: { argb: color } };
    }
    row.getCell(10).font = r.absent > 0 ? { color: { argb: "FFB42318" } } : {};
  });

  // Totals use real formulas, so they stay right if the admin edits a cell
  if (report.rows.length) {
    const first = 5;
    const last = 4 + report.rows.length;
    const sum = (col) => ({ formula: `SUM(${col}${first}:${col}${last})` });
    const totals = summary.addRow([
      "",
      `Team total (${report.rows.length} employees)`,
      "",
      "",
      "",
      "",
      sum("G"),
      sum("H"),
      sum("I"),
      sum("J"),
      sum("K"),
      null,
      null,
    ]);
    totals.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
      cell.border = { top: { style: "medium", color: { argb: TERRA } } };
    });
  }

  summary.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } };
  summary.getColumn(1).alignment = { horizontal: "center" };
  for (let c = 6; c <= 13; c++) summary.getColumn(c).alignment = { horizontal: "center" };

  summary.addRow([]);
  const note = summary.addRow([
    "",
    "Present Days include late days. Absent = finished work days with no check-in since the employee joined. Hours are shown as h:mm.",
  ]);
  note.getCell(2).font = { italic: true, size: 9, color: { argb: "FF6B5B54" } };

  /* ---------------- Sheet 2: Daily Details ---------------- */
  const daily = wb.addWorksheet("Daily Details", {
    views: [{ state: "frozen", ySplit: 4, xSplit: 1 }],
    properties: { tabColor: { argb: INK } },
  });

  const dailyColumns = [
    { header: "Employee Name", width: 24 },
    { header: "Email", width: 30 },
    { header: "Role", width: 18 },
    { header: "Date", width: 13, numFmt: "dd-mmm-yyyy" },
    { header: "Day", width: 7 },
    { header: "Status", width: 12 },
    { header: "First Check In", width: 13, numFmt: "h:mm AM/PM" },
    { header: "Last Check Out", width: 13, numFmt: "h:mm AM/PM" },
    { header: "Sessions", width: 9 },
    { header: "Worked", width: 10, numFmt: "[h]:mm" },
  ];

  addTitle(daily, `Daily Attendance — ${monthTitle(report.month)}`, subtitle, dailyColumns.length);
  dailyColumns.forEach((c, i) => {
    const col = daily.getColumn(i + 1);
    col.width = c.width;
    if (c.numFmt) col.numFmt = c.numFmt;
  });
  const dailyHeader = daily.getRow(4);
  dailyHeader.values = dailyColumns.map((c) => c.header);
  styleHeader(dailyHeader);

  const dayName = (key) =>
    keyToDate(key).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });

  for (const r of report.rows) {
    for (const d of r.days) {
      const rec = d.record;
      const row = daily.addRow([
        fullName(r.user),
        r.user.email,
        ROLE_LABELS[r.user.role] || r.user.role,
        keyToDate(d.date),
        dayName(d.date),
        STATUS_LABELS[d.status] || d.status,
        rec ? officeDate(rec.checkIn) : null,
        rec?.checkOut ? officeDate(rec.checkOut) : rec ? "Working" : null,
        rec ? rec.sessionCount : null,
        rec ? duration(rec.workMinutes) : null,
      ]);
      const fill = STATUS_FILLS[d.status];
      if (fill) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        });
      }
      if (d.status === "absent") row.getCell(6).font = { bold: true, color: { argb: "FFB42318" } };
      if (d.status === "late") row.getCell(6).font = { bold: true, color: { argb: CLAY } };
    }
  }

  daily.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: dailyColumns.length } };
  for (let c = 4; c <= 10; c++) daily.getColumn(c).alignment = { horizontal: "center" };

  return wb;
}
