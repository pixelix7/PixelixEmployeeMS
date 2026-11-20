import AppError from "../utils/AppError.js";
import { buildDailyReport } from "../utils/dailyReport.js";
import { dailyReportWorkbook } from "../utils/dailyReportXlsx.js";
import { DATE_RE, dateKey } from "../utils/time.js";

const parseDate = (value) => {
  const date = value || dateKey();
  if (!DATE_RE.test(date)) throw new AppError("date must look like YYYY-MM-DD", 400);
  if (date > dateKey()) throw new AppError("date can't be in the future", 400);
  return date;
};

// Names for the people in events, without sending whole user records twice
const peopleIndex = (rows) =>
  Object.fromEntries(
    rows.map((r) => [String(r.user._id), { name: `${r.user.firstName} ${r.user.lastName}`, role: r.user.role }])
  );

// GET /api/reports/daily?date=2026-11-19
export const getDailyReport = async (req, res) => {
  const report = await buildDailyReport(parseDate(req.query.date));
  res.json({ ...report, people: peopleIndex(report.rows) });
};

// GET /api/reports/daily/export?date=2026-11-19  -> .xlsx
export const exportDailyReport = async (req, res) => {
  const date = parseDate(req.query.date);
  const report = await buildDailyReport(date);
  const workbook = dailyReportWorkbook(report, {
    generatedBy: `${req.user.firstName} ${req.user.lastName}`,
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="daily-report-${date}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
};
