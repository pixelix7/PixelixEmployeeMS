import mongoose from "mongoose";
import User, { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import { buildDailyReport } from "../utils/dailyReport.js";
import { dailyReportWorkbook } from "../utils/dailyReportXlsx.js";
import { monthlyReportWorkbook } from "../utils/monthlyReportXlsx.js";
import { dailyReportPdf, monthlyReportPdf, sendPdf } from "../utils/reportPdf.js";
import { buildMonthlyReport, parseMonth } from "./attendanceController.js";
import { DATE_RE, dateKey } from "../utils/time.js";

const parseDate = (value) => {
  const date = value || dateKey();
  if (!DATE_RE.test(date)) throw new AppError("date must look like YYYY-MM-DD", 400);
  if (date > dateKey()) throw new AppError("date can't be in the future", 400);
  return date;
};

const parseFormat = (value) => {
  const format = value || "xlsx";
  if (!["xlsx", "pdf"].includes(format)) throw new AppError("format must be xlsx or pdf", 400);
  return format;
};

// ?user=<id> -> that employee (telecaller / digital marketing), or null for everyone
const parseEmployee = async (id) => {
  if (!id) return null;
  if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid employee", 400);
  const user = await User.findById(id);
  if (!user || user.role === ROLES.ADMIN) throw new AppError("Employee not found", 404);
  return user;
};

const fullName = (u) => `${u.firstName} ${u.lastName}`;
// "Ravi Kumar" -> "ravi-kumar" for file names
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "employee";

// Names for the people in events, without sending whole user records twice
const peopleIndex = (rows) =>
  Object.fromEntries(
    rows.map((r) => [String(r.user._id), { name: `${r.user.firstName} ${r.user.lastName}`, role: r.user.role }])
  );

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function sendWorkbook(res, workbook, filename) {
  res.setHeader("Content-Type", XLSX_TYPE);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

/* ---------------- Daily ---------------- */

const loadDaily = async (query) => {
  const date = parseDate(query.date);
  const employee = await parseEmployee(query.user);
  const report = await buildDailyReport(date, { userId: employee?._id });
  if (employee && !report.rows.length) {
    throw new AppError(`${fullName(employee)} wasn't an active employee on that day`, 400);
  }
  return { date, employee, report };
};

// GET /api/reports/daily?date=2026-11-19[&user=<id>]
export const getDailyReport = async (req, res) => {
  const { report } = await loadDaily(req.query);
  res.json({ ...report, people: peopleIndex(report.rows) });
};

// GET /api/reports/daily/export?date=2026-11-19[&user=<id>][&format=xlsx|pdf]
export const exportDailyReport = async (req, res) => {
  const format = parseFormat(req.query.format);
  const { date, employee, report } = await loadDaily(req.query);
  const options = { generatedBy: fullName(req.user), scope: employee ? fullName(employee) : undefined };
  const base = `daily-report-${employee ? `${slug(fullName(employee))}-` : ""}${date}`;

  if (format === "pdf") return sendPdf(res, dailyReportPdf(report, options), `${base}.pdf`);
  await sendWorkbook(res, dailyReportWorkbook(report, options), `${base}.xlsx`);
};

/* ---------------- Monthly ---------------- */

const loadMonthly = async (query) => {
  const month = parseMonth(query.month);
  const employee = await parseEmployee(query.user);
  const report = await buildMonthlyReport(month, { userId: employee?._id });
  if (employee && !report.rows.length) {
    throw new AppError(`${fullName(employee)} wasn't an active employee in that month`, 400);
  }
  return { month, employee, report };
};

// GET /api/reports/monthly?month=2026-11[&user=<id>]
// Everyone: totals per employee. One employee: also every day.
export const getMonthlyReport = async (req, res) => {
  const { employee, report } = await loadMonthly(req.query);
  const { today: _today, rows, ...rest } = report;
  res.json({
    ...rest,
    rows: employee
      ? rows.map((r) => ({ ...r, days: [...r.days].reverse() })) // newest first on screen
      : rows.map(({ days: _days, ...row }) => row),
  });
};

// GET /api/reports/monthly/export?month=2026-11[&user=<id>][&format=xlsx|pdf]
export const exportMonthlyReport = async (req, res) => {
  const format = parseFormat(req.query.format);
  const { month, employee, report } = await loadMonthly(req.query);
  const options = { generatedBy: fullName(req.user), scope: employee ? fullName(employee) : undefined };
  const base = `monthly-report-${employee ? `${slug(fullName(employee))}-` : ""}${month}`;

  if (format === "pdf") return sendPdf(res, monthlyReportPdf(report, options), `${base}.pdf`);
  await sendWorkbook(res, await monthlyReportWorkbook(report, options), `${base}.xlsx`);
};
