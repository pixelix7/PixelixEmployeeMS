import LeaveRequest, { LEAVE_STATUS, LEAVE_TYPES, nextDay } from "../models/LeaveRequest.js";
import { loadHolidays } from "../models/Holiday.js";
import { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import { DATE_RE, dateKey, isWorkDay } from "../utils/time.js";

const PEOPLE = "firstName lastName role email";
const MAX_SPAN_DAYS = 60;
const MAX_BACKDATE_DAYS = 30;

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// Working days in a range for this person (their off days and holidays don't count)
const countLeaveDays = async (user, from, to, halfDay) => {
  const holidays = await loadHolidays(from, to);
  let days = 0;
  for (let d = from; d <= to; d = nextDay(d)) {
    if (isWorkDay(d, user) && !holidays.has(d)) days++;
  }
  return halfDay && days ? 0.5 : days;
};

// POST /api/leaves  { type, from, to, halfDay?, reason }   (telecallers & marketers)
export const applyLeave = async (req, res) => {
  const { type, from, to = from, halfDay = false, reason } = req.body || {};
  if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) {
    throw new AppError("Pick valid start and end dates", 400);
  }
  if (to < from) throw new AppError("End date can't be before the start date", 400);
  if (daysBetween(from, to) + 1 > MAX_SPAN_DAYS) {
    throw new AppError(`A single request can cover at most ${MAX_SPAN_DAYS} days`, 400);
  }
  if (daysBetween(from, dateKey()) > MAX_BACKDATE_DAYS) {
    throw new AppError(`Leave can't start more than ${MAX_BACKDATE_DAYS} days in the past`, 400);
  }

  // No overlapping pending/approved requests
  const clash = await LeaveRequest.findOne({
    user: req.user._id,
    status: { $in: [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED] },
    from: { $lte: to },
    to: { $gte: from },
  });
  if (clash) {
    throw new AppError(
      `You already have a ${clash.status} leave from ${clash.from} to ${clash.to} that overlaps these dates`,
      409
    );
  }

  const days = await countLeaveDays(req.user, from, to, Boolean(halfDay));
  if (!days) throw new AppError("Those dates are all off days or holidays — no leave needed", 400);

  const leave = await LeaveRequest.create({
    user: req.user._id,
    type,
    from,
    to,
    halfDay: Boolean(halfDay),
    reason,
    days,
  });
  res.status(201).json({ message: "Leave request sent", leave });
};

// GET /api/leaves/me   -> my requests (newest first) + days used this year by type
export const myLeaves = async (req, res) => {
  const year = dateKey().slice(0, 4);
  const leaves = await LeaveRequest.find({ user: req.user._id })
    .sort({ from: -1 })
    .limit(100)
    .populate("reviewedBy", "firstName lastName");

  const usedThisYear = Object.fromEntries(LEAVE_TYPES.map((t) => [t, 0]));
  for (const l of leaves) {
    if (l.status === LEAVE_STATUS.APPROVED && l.from.startsWith(year)) usedThisYear[l.type] += l.days;
  }
  res.json({
    leaves,
    usedThisYear,
    pending: leaves.filter((l) => l.status === LEAVE_STATUS.PENDING).length,
  });
};

// PATCH /api/leaves/:id/cancel   (own pending request)
export const cancelLeave = async (req, res) => {
  const leave = await LeaveRequest.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id, status: LEAVE_STATUS.PENDING },
    { status: LEAVE_STATUS.CANCELLED },
    { new: true }
  );
  if (!leave) throw new AppError("Only your pending requests can be cancelled", 400);
  res.json({ message: "Leave request cancelled", leave });
};

// GET /api/leaves?status=pending&user=&page=   (admin)
export const listLeaves = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const filter = {};
  if (req.query.status) {
    if (!Object.values(LEAVE_STATUS).includes(req.query.status)) throw new AppError("Invalid status filter", 400);
    filter.status = req.query.status;
  }
  if (req.query.user) filter.user = req.query.user;

  const [leaves, total, counts] = await Promise.all([
    LeaveRequest.find(filter)
      // Pending: oldest first (first come, first served); others: newest first
      .sort(filter.status === LEAVE_STATUS.PENDING ? { createdAt: 1 } : { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", PEOPLE)
      .populate("reviewedBy", "firstName lastName"),
    LeaveRequest.countDocuments(filter),
    LeaveRequest.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);

  res.json({
    leaves,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

// PATCH /api/leaves/:id/review  { status: "approved" | "rejected", note? }   (admin)
export const reviewLeave = async (req, res) => {
  const { status, note = "" } = req.body || {};
  if (![LEAVE_STATUS.APPROVED, LEAVE_STATUS.REJECTED].includes(status)) {
    throw new AppError("Status must be approved or rejected", 400);
  }
  // Only pending requests, and safe if two admins click at once
  const leave = await LeaveRequest.findOneAndUpdate(
    { _id: req.params.id, status: LEAVE_STATUS.PENDING },
    { status, reviewedBy: req.user._id, reviewedAt: new Date(), reviewNote: String(note).trim().slice(0, 300) },
    { new: true }
  )
    .populate("user", PEOPLE)
    .populate("reviewedBy", "firstName lastName");
  if (!leave) throw new AppError("This request was already reviewed or cancelled", 409);
  res.json({ message: `Leave ${status}`, leave });
};

// For the admin dashboard
export const leaveSummary = async (req, res) => {
  const today = dateKey();
  const [pending, onLeaveToday] = await Promise.all([
    LeaveRequest.countDocuments({ status: LEAVE_STATUS.PENDING }),
    LeaveRequest.countDocuments({ status: LEAVE_STATUS.APPROVED, from: { $lte: today }, to: { $gte: today } }),
  ]);
  res.json({ pending, onLeaveToday });
};

export const STAFF_ONLY = [ROLES.TELECALLER, ROLES.DIGITAL_MARKETING];
