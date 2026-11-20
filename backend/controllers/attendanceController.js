import Attendance, { ATTENDANCE_STATUS } from "../models/Attendance.js";
import User, { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import { monthlyReportWorkbook } from "../utils/monthlyReportXlsx.js";
import {
  DATE_RE,
  MONTH_RE,
  attendancePolicy,
  dateKey,
  daysInMonth,
  isLate,
  isWorkDay,
  monthKey,
} from "../utils/time.js";

// Roles that clock in. Admins don't, so they're left out of attendance reports.
const STAFF_ROLES = [ROLES.TELECALLER, ROLES.DIGITAL_MARKETING];

// Day statuses used in admin reports
export const DAY_STATUS = {
  PRESENT: "present", // clocked in on time
  LATE: "late", // clocked in after LATE_AFTER
  ABSENT: "absent", // work day, no record, day is over
  NOT_IN: "not_in", // today, hasn't clocked in yet
  OFF: "off", // not a work day, no record
};

export const statusFor = (date, record, today) => {
  if (record) return record.status;
  if (date === today) return DAY_STATUS.NOT_IN;
  return isWorkDay(date) ? DAY_STATUS.ABSENT : DAY_STATUS.OFF;
};

const parseMonth = (value) => {
  const month = value || monthKey();
  if (!MONTH_RE.test(month)) throw new AppError("month must look like YYYY-MM", 400);
  if (month > monthKey()) throw new AppError("month can't be in the future", 400);
  return month;
};

const monthRange = (month) => ({ $gte: `${month}-01`, $lte: `${month}-31` });

// Summarises one person's month. `days` = dates elapsed so far that count for them.
const summarise = (days, records, today) => {
  const byDate = new Map(records.map((r) => [r.date, r]));
  let present = 0;
  let late = 0;
  let absent = 0;
  let workMinutes = 0;
  let completedDays = 0;
  let expectedDays = 0;

  for (const date of days) {
    const status = statusFor(date, byDate.get(date), today);
    if (status === DAY_STATUS.PRESENT) present++;
    if (status === DAY_STATUS.LATE) late++;
    if (status === DAY_STATUS.ABSENT) absent++;
    // Expected = finished work days, plus any day they actually came in
    if (status !== DAY_STATUS.OFF && status !== DAY_STATUS.NOT_IN) expectedDays++;
  }

  let completedMinutes = 0;
  for (const r of records) {
    // Total includes finished sessions from a day still in progress
    workMinutes += r.workMinutes;
    if (r.checkOut) {
      completedMinutes += r.workMinutes;
      completedDays++;
    }
  }

  const attended = present + late;
  return {
    present: attended, // all days they came in, late included
    onTime: present,
    late,
    absent,
    workMinutes,
    avgWorkMinutes: completedDays ? Math.round(completedMinutes / completedDays) : null,
    attendanceRate: expectedDays ? Math.round((attended / expectedDays) * 100) : null,
  };
};

// Dates in `month` up to today, from the day the user joined
const countedDays = (month, user, today) => {
  const joined = dateKey(user.createdAt);
  return daysInMonth(month).filter((d) => d <= today && d >= joined);
};

// GET /api/attendance/today
export const getToday = async (req, res) => {
  const record = await Attendance.findOne({ user: req.user._id, date: dateKey() });
  res.json({ record, policy: attendancePolicy() });
};

// POST /api/attendance/clock-in
// First clock-in creates today's record; after a clock-out it starts a new session.
export const clockIn = async (req, res) => {
  const now = new Date();
  const date = dateKey(now);
  const existing = await Attendance.findOne({ user: req.user._id, date });

  if (!existing) {
    try {
      const record = await Attendance.create({
        user: req.user._id,
        date,
        checkIn: now,
        sessions: [{ in: now }],
        status: isLate(now) ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT,
      });
      return res.status(201).json({ message: "Clocked in", record });
    } catch (err) {
      // Two clicks at once: the unique index lets only one create the record
      if (err.code === 11000) throw new AppError("You are already clocked in", 409);
      throw err;
    }
  }

  if (!existing.checkOut) throw new AppError("You are already clocked in", 409);

  // Resume: start a new session. Records from before sessions existed get
  // their first session filled in so no time is lost.
  const sessions = existing.sessions.length
    ? [...existing.sessions, { in: now }]
    : [{ in: existing.checkIn, out: existing.checkOut }, { in: now }];

  // Matching on checkOut makes this safe against double clicks
  const record = await Attendance.findOneAndUpdate(
    { _id: existing._id, checkOut: existing.checkOut },
    { $set: { sessions, checkOut: null } },
    { new: true }
  );
  if (!record) throw new AppError("You are already clocked in", 409);

  res.json({ message: "Clocked in again", record });
};

// POST /api/attendance/clock-out
export const clockOut = async (req, res) => {
  const date = dateKey();
  const now = new Date();

  // Only a running day can be clocked out (safe against double clicks).
  // The open session gets its end time; older records have no sessions to update.
  const record = await Attendance.findOneAndUpdate(
    { user: req.user._id, date, checkOut: null },
    { $set: { checkOut: now, "sessions.$[open].out": now } },
    { new: true, arrayFilters: [{ "open.out": null }] }
  );

  if (!record) {
    const existing = await Attendance.exists({ user: req.user._id, date });
    throw existing
      ? new AppError("You are already clocked out", 409)
      : new AppError("You haven't clocked in today", 400);
  }

  res.json({ message: "Clocked out", record });
};

// GET /api/attendance/me?month=2026-11&limit=10
// Returns this month's records (newest first) and a summary
export const getMyAttendance = async (req, res) => {
  const month = parseMonth(req.query.month);

  const records = await Attendance.find({
    user: req.user._id,
    date: monthRange(month),
  }).sort({ date: -1 });

  // Average over finished days only, so a day still in progress doesn't drag it down
  const completed = records.filter((r) => r.checkOut);
  const totalMinutes = completed.reduce((sum, r) => sum + r.workMinutes, 0);

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 31, 1), 31);

  res.json({
    month,
    summary: {
      daysPresent: records.length,
      lateArrivals: records.filter((r) => r.status === ATTENDANCE_STATUS.LATE).length,
      avgWorkMinutes: completed.length ? Math.round(totalMinutes / completed.length) : null,
    },
    records: records.slice(0, limit),
  });
};

/* ---------------- Admin reports ---------------- */

const staffUsers = (extra = {}) =>
  User.find({ role: { $in: STAFF_ROLES }, ...extra }).sort({ firstName: 1, lastName: 1 });

// GET /api/attendance/daily?date=2026-11-19
// Every staff member with their record (or absent / not in) for one day
export const getDaily = async (req, res) => {
  const today = dateKey();
  const date = req.query.date || today;
  if (!DATE_RE.test(date)) throw new AppError("date must look like YYYY-MM-DD", 400);
  if (date > today) throw new AppError("date can't be in the future", 400);

  // Only people who had joined by that day
  const users = (await staffUsers()).filter((u) => dateKey(u.createdAt) <= date);
  const records = await Attendance.find({ date, user: { $in: users.map((u) => u._id) } });
  const byUser = new Map(records.map((r) => [String(r.user), r]));

  const rows = users.map((user) => {
    const record = byUser.get(String(user._id)) || null;
    return { user, record, status: statusFor(date, record, today) };
  });

  const count = (status) => rows.filter((r) => r.status === status).length;

  res.json({
    date,
    isToday: date === today,
    isWorkDay: isWorkDay(date),
    summary: {
      total: rows.length,
      present: count(DAY_STATUS.PRESENT) + count(DAY_STATUS.LATE),
      late: count(DAY_STATUS.LATE),
      absent: count(DAY_STATUS.ABSENT),
      notIn: count(DAY_STATUS.NOT_IN),
      working: rows.filter((r) => r.record && !r.record.checkOut).length,
    },
    rows,
  });
};

// The whole month for every staff member: totals plus each day.
// Shared by the on-screen report and the Excel export so they always agree.
export const buildMonthlyReport = async (month) => {
  const today = dateKey();
  const monthEnd = `${month}-31`;

  // Only people who had joined by the end of that month
  const users = (await staffUsers()).filter((u) => dateKey(u.createdAt) <= monthEnd);
  const records = await Attendance.find({
    date: monthRange(month),
    user: { $in: users.map((u) => u._id) },
  });

  const recordsByUser = new Map();
  for (const r of records) {
    const key = String(r.user);
    if (!recordsByUser.has(key)) recordsByUser.set(key, []);
    recordsByUser.get(key).push(r);
  }

  const rows = users.map((user) => {
    const userRecords = recordsByUser.get(String(user._id)) || [];
    const days = countedDays(month, user, today);
    const byDate = new Map(userRecords.map((r) => [r.date, r]));
    return {
      user,
      ...summarise(days, userRecords, today),
      days: days.map((date) => {
        const record = byDate.get(date) || null;
        return { date, status: statusFor(date, record, today), record };
      }),
    };
  });

  const total = (field) => rows.reduce((sum, r) => sum + r[field], 0);
  const elapsed = daysInMonth(month).filter((d) => d <= today);

  return {
    month,
    today,
    workingDays: elapsed.filter(isWorkDay).length, // work days so far this month
    summary: {
      employees: rows.length,
      present: total("present"),
      late: total("late"),
      absent: total("absent"),
      workMinutes: total("workMinutes"),
    },
    rows,
  };
};

// GET /api/attendance/monthly?month=2026-11
// Present / late / absent / hours for every staff member in a month
export const getMonthly = async (req, res) => {
  const { today: _today, rows, ...rest } = await buildMonthlyReport(parseMonth(req.query.month));
  // The screen doesn't need every day of every person
  res.json({ ...rest, rows: rows.map(({ days: _days, ...row }) => row) });
};

// GET /api/attendance/monthly/export?month=2026-11  -> .xlsx download
export const exportMonthly = async (req, res) => {
  const month = parseMonth(req.query.month);
  const report = await buildMonthlyReport(month);
  const workbook = await monthlyReportWorkbook(report, {
    generatedBy: `${req.user.firstName} ${req.user.lastName}`,
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="attendance-report-${month}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
};

// GET /api/attendance/user/:id?month=2026-11
// One staff member's month, day by day (absent and off days included)
export const getUserMonth = async (req, res) => {
  const today = dateKey();
  const month = parseMonth(req.query.month);

  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found", 404);

  const records = await Attendance.find({ user: user._id, date: monthRange(month) });
  const byDate = new Map(records.map((r) => [r.date, r]));
  const days = countedDays(month, user, today);

  res.json({
    month,
    user,
    summary: summarise(days, records, today),
    days: days
      .map((date) => {
        const record = byDate.get(date) || null;
        return { date, status: statusFor(date, record, today), record };
      })
      .reverse(), // newest first
  });
};
