import mongoose from "mongoose";
import SalaryRecord from "../models/SalaryRecord.js";
import User, { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import pick from "../utils/pick.js";
import { dateKey } from "../utils/time.js";
import { buildMonthlyReport, parseMonth } from "./attendanceController.js";

const EDITABLE = ["baseSalary", "incentives", "deductions", "status", "paidOn", "paymentMode", "reference", "notes"];
const PERSON = "firstName lastName role email phone isActive createdAt deactivatedAt";
const MODE_LABEL = { bank_transfer: "bank transfer", upi: "UPI", cash: "cash", cheque: "cheque" };
const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const fullName = (u) => `${u.firstName} ${u.lastName}`;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const POPULATE = [
  { path: "user", select: PERSON },
  { path: "history.by", select: "firstName lastName" },
];

const saveRecord = async (record) => {
  try {
    await record.save();
  } catch (err) {
    if (err.code === 11000) throw new AppError("This employee already has a salary record for that month", 409);
    throw err;
  }
};

// The most recent base salary we have for each employee (before `month`)
const lastBaseSalaries = async (userIds, month) => {
  const rows = await SalaryRecord.aggregate([
    { $match: { user: { $in: userIds }, month: { $lt: month } } },
    { $sort: { month: -1 } },
    { $group: { _id: "$user", baseSalary: { $first: "$baseSalary" }, month: { $first: "$month" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
};

// GET /api/salaries?month=2026-11&status=pending|paid|missing&q=
// Every employee who worked that month, with their record (or none yet) and attendance
export const listSalaries = async (req, res) => {
  const month = parseMonth(req.query.month);
  const [report, records] = await Promise.all([
    buildMonthlyReport(month),
    SalaryRecord.find({ month }).populate(POPULATE),
  ]);

  const byUser = new Map(records.map((r) => [String(r.user?._id), r]));
  const people = new Map(report.rows.map((r) => [String(r.user._id), r]));
  // Someone with a record who no longer shows in the report (e.g. deactivated) still appears
  for (const r of records) if (r.user && !people.has(String(r.user._id))) people.set(String(r.user._id), { user: r.user });

  const suggested = await lastBaseSalaries(
    [...people.keys()].map((id) => new mongoose.Types.ObjectId(id)),
    month
  );

  let rows = [...people.values()].map((p) => {
    const id = String(p.user._id);
    return {
      user: p.user,
      record: byUser.get(id) || null,
      suggestedBase: suggested.get(id)?.baseSalary ?? null,
      attendance: p.present == null
        ? null
        : {
            present: p.present,
            absent: p.absent,
            halfDays: p.halfDays,
            leaveDays: p.leaveDays,
            late: p.late,
            rate: p.attendanceRate,
          },
    };
  });
  rows.sort((a, b) => fullName(a.user).localeCompare(fullName(b.user)));

  // Totals cover every record in the month, whatever the filter
  const totals = {
    employees: rows.length,
    records: records.length,
    missing: rows.filter((r) => !r.record).length,
    base: 0,
    incentives: 0,
    deductions: 0,
    net: 0,
    paid: 0,
    pending: 0,
    paidCount: 0,
    pendingCount: 0,
  };
  for (const r of records) {
    totals.base += r.baseSalary;
    totals.incentives += r.incentiveTotal;
    totals.deductions += r.deductionTotal;
    totals.net += r.netPay;
    if (r.status === "paid") {
      totals.paid += r.netPay;
      totals.paidCount += 1;
    } else {
      totals.pending += r.netPay;
      totals.pendingCount += 1;
    }
  }

  const status = req.query.status;
  if (status === "missing") rows = rows.filter((r) => !r.record);
  else if (status === "pending" || status === "paid") rows = rows.filter((r) => r.record?.status === status);
  else if (status) throw new AppError("Invalid status filter", 400);

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    rows = rows.filter((r) => regex.test(fullName(r.user)) || regex.test(r.user.email || ""));
  }

  res.json({ month, rows, totals });
};

// GET /api/salaries/user/:id -> every month for one employee (newest first)
export const employeeHistory = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError("Invalid employee", 400);
  const user = await User.findById(req.params.id);
  if (!user || user.role === ROLES.ADMIN) throw new AppError("Employee not found", 404);
  const records = await SalaryRecord.find({ user: user._id }).sort({ month: -1 }).limit(36).populate("history.by", "firstName lastName");
  const paid = records.filter((r) => r.status === "paid");
  res.json({
    user,
    records,
    totals: {
      months: records.length,
      paid: paid.reduce((n, r) => n + r.netPay, 0),
      incentives: records.reduce((n, r) => n + r.incentiveTotal, 0),
    },
  });
};

// POST /api/salaries   { user, month, baseSalary, incentives, deductions, ... }
export const createSalary = async (req, res) => {
  const month = parseMonth(req.body?.month);
  const userId = req.body?.user;
  if (!mongoose.isValidObjectId(userId)) throw new AppError("Validation failed", 400, { user: "Choose an employee" });
  const user = await User.findById(userId);
  if (!user || user.role === ROLES.ADMIN) throw new AppError("Employee not found", 404);

  const record = new SalaryRecord({
    ...pick(req.body, EDITABLE),
    user: user._id,
    month,
    createdBy: req.user._id,
    history: [{ by: req.user._id, note: "Record created" }],
  });
  if (record.status === "paid") {
    record.history.push({ by: req.user._id, note: `Marked paid (${MODE_LABEL[record.paymentMode] || record.paymentMode})` });
  }
  await saveRecord(record);
  await record.populate(POPULATE);
  res.status(201).json({ message: `Salary record added for ${fullName(user)}`, record });
};

// POST /api/salaries/generate   { month }
// Creates a pending record for every employee without one, using their last base salary
export const generateMonth = async (req, res) => {
  const month = parseMonth(req.body?.month);
  const report = await buildMonthlyReport(month);
  const users = report.rows.map((r) => r.user);
  const existing = new Set(
    (await SalaryRecord.find({ month, user: { $in: users.map((u) => u._id) } }).select("user")).map((r) => String(r.user))
  );
  const todo = users.filter((u) => !existing.has(String(u._id)));
  const last = await lastBaseSalaries(todo.map((u) => u._id), month);

  const created = [];
  const skipped = [];
  for (const u of todo) {
    const prev = last.get(String(u._id));
    if (!prev) {
      skipped.push(fullName(u));
      continue;
    }
    const record = new SalaryRecord({
      user: u._id,
      month,
      baseSalary: prev.baseSalary,
      createdBy: req.user._id,
      history: [{ by: req.user._id, note: `Generated from ${prev.month} (base ${money(prev.baseSalary)})` }],
    });
    try {
      await record.save();
      created.push(fullName(u));
    } catch (err) {
      if (err.code !== 11000) throw err; // created meanwhile — fine
    }
  }

  const parts = [`${created.length} record${created.length === 1 ? "" : "s"} created`];
  if (skipped.length) parts.push(`${skipped.length} need a first record (no previous salary): ${skipped.join(", ")}`);
  res.json({ message: parts.join(". "), created, skipped });
};

// PATCH /api/salaries/:id   any of the editable fields
export const updateSalary = async (req, res) => {
  const record = await SalaryRecord.findById(req.params.id);
  if (!record) throw new AppError("Salary record not found", 404);

  const before = { status: record.status, net: record.netPay };
  const data = pick(req.body, EDITABLE);
  record.set(data);
  // Validation recomputes the totals; run it now so the history note shows the new net pay
  await record.validate().catch(() => {});

  const notes = [];
  const detailsChanged = ["baseSalary", "incentives", "deductions", "notes"].some((k) => k in data && record.isModified(k));
  if (detailsChanged && record.netPay !== before.net) notes.push(`Net pay ${money(before.net)} → ${money(record.netPay)}`);
  else if (detailsChanged) notes.push("Details updated");
  if (record.status !== before.status) {
    notes.push(record.status === "paid" ? `Marked paid (${MODE_LABEL[record.paymentMode] || record.paymentMode || "—"})` : "Marked unpaid");
  } else if (record.status === "paid" && ["paidOn", "paymentMode", "reference"].some((k) => k in data && record.isModified(k))) {
    notes.push("Payment details updated");
  }
  if (notes.length) record.history.push({ by: req.user._id, note: notes.join(" · ") });

  await saveRecord(record);
  await record.populate(POPULATE);
  res.json({ message: "Salary record updated", record });
};

// PATCH /api/salaries/:id/pay   { paidOn?, paymentMode, reference? }
export const markPaid = async (req, res) => {
  const record = await SalaryRecord.findById(req.params.id);
  if (!record) throw new AppError("Salary record not found", 404);
  if (record.status === "paid") throw new AppError("This salary is already marked paid", 409);
  record.set({
    status: "paid",
    paidOn: req.body?.paidOn || dateKey(),
    paymentMode: req.body?.paymentMode,
    reference: req.body?.reference ?? record.reference,
  });
  record.history.push({ by: req.user._id, note: `Marked paid (${MODE_LABEL[req.body?.paymentMode] || "—"})` });
  await saveRecord(record);
  await record.populate(POPULATE);
  res.json({ message: `Marked ${money(record.netPay)} as paid`, record });
};

// DELETE /api/salaries/:id
export const deleteSalary = async (req, res) => {
  const record = await SalaryRecord.findByIdAndDelete(req.params.id);
  if (!record) throw new AppError("Salary record not found", 404);
  res.json({ message: "Salary record deleted" });
};
