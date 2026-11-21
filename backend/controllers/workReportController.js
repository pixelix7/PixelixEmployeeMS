import mongoose from "mongoose";
import WorkReport from "../models/WorkReport.js";
import { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import pick from "../utils/pick.js";
import { buildDailyReport } from "../utils/dailyReport.js";
import { DATE_RE, MONTH_RE, dateKey } from "../utils/time.js";

const FIELDS = ["summary", "blockers", "tomorrow"];
const BACKDATE_DAYS = 7; // how far back an employee can file a missed report
const PERSON = "firstName lastName role email isActive";
const POPULATE = [
  { path: "user", select: PERSON },
  { path: "reviewedBy", select: "firstName lastName" },
  { path: "history.by", select: "firstName lastName" },
];

const shiftDay = (key, days) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

const checkDate = (date, user) => {
  const today = dateKey();
  if (!DATE_RE.test(date || "")) throw new AppError("Validation failed", 400, { date: "Pick a valid date" });
  if (date > today) throw new AppError("Validation failed", 400, { date: "You can't report on a future day" });
  if (date < shiftDay(today, -BACKDATE_DAYS)) {
    throw new AppError("Validation failed", 400, { date: `Reports can only be filed for the last ${BACKDATE_DAYS} days` });
  }
  if (date < dateKey(user.createdAt)) throw new AppError("Validation failed", 400, { date: "That's before you joined" });
};

// What the system recorded for these (user, date) pairs: attendance, hours, calls / work updates.
// One daily-report build per distinct date.
const dayContext = async (reports) => {
  const dates = [...new Set(reports.map((r) => r.date))];
  const built = await Promise.all(dates.map((d) => buildDailyReport(d)));
  const byKey = new Map();
  built.forEach((report) => {
    for (const row of report.rows) {
      byKey.set(`${row.user._id}|${report.date}`, {
        status: row.attendance.status,
        firstIn: row.attendance.firstIn,
        lastOut: row.attendance.lastOut,
        workMinutes: row.attendance.workMinutes,
        calls: row.telecaller ? { logged: row.telecaller.callsLogged, added: row.telecaller.leadsAdded, converted: row.telecaller.converted } : null,
        work: row.marketing ? { updates: row.marketing.updates, closed: row.marketing.closed, won: row.marketing.won } : null,
      });
    }
  });
  return (report) => byKey.get(`${report.user?._id || report.user}|${report.date}`) || null;
};

const withContext = async (reports) => {
  const lookup = await dayContext(reports);
  return reports.map((r) => ({ ...r.toJSON(), day: lookup(r) }));
};

/* ================= Employees ================= */

// GET /api/work-reports/me?month=2026-11 -> my reports that month (newest first) + today's
export const myReports = async (req, res) => {
  const month = req.query.month || dateKey().slice(0, 7);
  if (!MONTH_RE.test(month)) throw new AppError("month must look like YYYY-MM", 400);
  const today = dateKey();
  const [reports, todayReport] = await Promise.all([
    WorkReport.find({ user: req.user._id, date: { $gte: `${month}-01`, $lte: `${month}-31` } })
      .sort({ date: -1 })
      .populate(POPULATE),
    WorkReport.findOne({ user: req.user._id, date: today }).populate(POPULATE),
  ]);
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const r of reports) counts[r.status] += 1;
  res.json({
    month,
    today,
    earliest: shiftDay(today, -BACKDATE_DAYS),
    todayReport: todayReport ? (await withContext([todayReport]))[0] : null,
    reports: await withContext(reports),
    counts,
  });
};

// POST /api/work-reports   { date?, summary, blockers, tomorrow }
export const submitReport = async (req, res) => {
  const date = req.body?.date || dateKey();
  checkDate(date, req.user);
  const existing = await WorkReport.findOne({ user: req.user._id, date });
  if (existing) {
    throw new AppError(
      existing.status === "approved"
        ? "Your report for that day is already approved"
        : "You already submitted a report for that day — edit it instead",
      409
    );
  }
  const report = new WorkReport({
    ...pick(req.body, FIELDS),
    user: req.user._id,
    date,
    history: [{ by: req.user._id, action: "submitted" }],
  });
  try {
    await report.save();
  } catch (err) {
    if (err.code === 11000) throw new AppError("You already submitted a report for that day", 409);
    throw err;
  }
  await report.populate(POPULATE);
  res.status(201).json({ message: "Report submitted for review", report });
};

// PATCH /api/work-reports/:id   { summary, blockers, tomorrow }
// Own report, while pending or after a rejection (which sends it back for review)
export const editReport = async (req, res) => {
  const report = await WorkReport.findById(req.params.id);
  if (!report || String(report.user) !== String(req.user._id)) throw new AppError("Report not found", 404);
  if (report.status === "approved") throw new AppError("Approved reports can't be changed", 400);

  const wasRejected = report.status === "rejected";
  report.set(pick(req.body, FIELDS));
  if (!report.isModified() && !wasRejected) return res.json({ message: "Nothing changed", report: await report.populate(POPULATE) });

  if (wasRejected) {
    report.status = "pending";
    report.submittedAt = new Date();
    report.history.push({ by: req.user._id, action: "resubmitted" });
  } else {
    report.history.push({ by: req.user._id, action: "edited" });
  }
  await report.save();
  await report.populate(POPULATE);
  res.json({ message: wasRejected ? "Report resubmitted for review" : "Report updated", report });
};

/* ================= Admin ================= */

// GET /api/work-reports?status=pending|approved|rejected|all&user=&date=&page=
export const listReports = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const status = req.query.status || "pending";

  const scope = {};
  if (req.query.user) {
    if (!mongoose.isValidObjectId(req.query.user)) throw new AppError("Invalid employee", 400);
    scope.user = new mongoose.Types.ObjectId(req.query.user);
  }
  if (req.query.date) {
    if (!DATE_RE.test(req.query.date)) throw new AppError("date must look like YYYY-MM-DD", 400);
    scope.date = req.query.date;
  }
  const filter = { ...scope };
  if (status !== "all") {
    if (!["pending", "approved", "rejected"].includes(status)) throw new AppError("Invalid status filter", 400);
    filter.status = status;
  }

  const [reports, total, byStatus] = await Promise.all([
    WorkReport.find(filter)
      // Oldest pending first (the queue); otherwise newest first
      .sort(status === "pending" ? { date: 1, submittedAt: 1 } : { date: -1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    WorkReport.countDocuments(filter),
    WorkReport.aggregate([{ $match: scope }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const s of byStatus) counts[s._id] = s.n;
  counts.all = counts.pending + counts.approved + counts.rejected;

  res.json({
    reports: await withContext(reports),
    counts,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

// GET /api/work-reports/summary -> admin: { pending }; employee: { today: status | null }
export const reportSummary = async (req, res) => {
  if (req.user.role === ROLES.ADMIN) {
    return res.json({ pending: await WorkReport.countDocuments({ status: "pending" }) });
  }
  const today = await WorkReport.findOne({ user: req.user._id, date: dateKey() }).select("status");
  const rejected = await WorkReport.countDocuments({ user: req.user._id, status: "rejected" });
  res.json({ today: today?.status || null, rejected });
};

// PATCH /api/work-reports/:id/review   { status: "approved" | "rejected", note }
export const reviewReport = async (req, res) => {
  const status = req.body?.status;
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  if (!["approved", "rejected"].includes(status)) throw new AppError("status must be approved or rejected", 400);
  if (status === "rejected" && !note) {
    throw new AppError("Validation failed", 400, { note: "Tell them what to fix so they can resubmit" });
  }
  if (note.length > 500) throw new AppError("Validation failed", 400, { note: "Note is too long" });

  // Only pending reports, and only once (two admins can't both review it)
  const report = await WorkReport.findOneAndUpdate(
    { _id: req.params.id, status: "pending" },
    {
      $set: { status, reviewedBy: req.user._id, reviewedAt: new Date(), reviewNote: note },
      $push: { history: { by: req.user._id, action: status, note, at: new Date() } },
    },
    { new: true, runValidators: true }
  ).populate(POPULATE);
  if (!report) {
    const exists = await WorkReport.exists({ _id: req.params.id });
    throw new AppError(exists ? "This report was already reviewed" : "Report not found", exists ? 409 : 404);
  }
  res.json({ message: `Report ${status}`, report });
};

// POST /api/work-reports/approve-all   { ids: [] }  approve several pending reports at once
export const approveMany = async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => mongoose.isValidObjectId(id)) : [];
  if (!ids.length) throw new AppError("Select at least one report", 400);
  const now = new Date();
  const { modifiedCount } = await WorkReport.updateMany(
    { _id: { $in: ids }, status: "pending" },
    {
      $set: { status: "approved", reviewedBy: req.user._id, reviewedAt: now, reviewNote: "" },
      $push: { history: { by: req.user._id, action: "approved", note: "", at: now } },
    }
  );
  res.json({ message: `${modifiedCount} report${modifiedCount === 1 ? "" : "s"} approved`, approved: modifiedCount });
};
