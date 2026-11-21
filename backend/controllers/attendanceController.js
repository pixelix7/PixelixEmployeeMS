import Attendance, { ATTENDANCE_STATUS } from "../models/Attendance.js";
import User, { ROLES } from "../models/User.js";
import { loadHolidays } from "../models/Holiday.js";
import { loadLeaves } from "../models/LeaveRequest.js";
import AppError from "../utils/AppError.js";
import { monthlyReportWorkbook } from "../utils/monthlyReportXlsx.js";
import {
  DATE_RE,
  MONTH_RE,
  attendancePolicy,
  companySchedule,
  dateKey,
  daysInMonth,
  halfDayMinutes,
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
  HALF_DAY: "half_day", // came in, but worked less than HALF_DAY_BELOW (finished days only)
  ABSENT: "absent", // work day, no record, day is over
  NOT_IN: "not_in", // today, hasn't clocked in yet
  HOLIDAY: "holiday", // office holiday, no record
  LEAVE: "leave", // approved leave, no record
  OFF: "off", // not a work day, no record
};

const NO_HOLIDAYS = new Map();
const NO_LEAVE = new Map();

// One day's status.
// `holidays`: Map date -> holiday name. `user`: decides their working days.
// `leaves`: Map date -> { type, halfDay } of this person's approved leave.
export const statusFor = (date, record, today, holidays = NO_HOLIDAYS, user = null, leaves = NO_LEAVE) => {
  if (record) {
    // Short days are only judged once the day is over (they may clock in again).
    // An approved half-day leave excuses a short day.
    if (date < today && record.workMinutes < halfDayMinutes() && !leaves.get(date)?.halfDay) {
      return DAY_STATUS.HALF_DAY;
    }
    return record.status;
  }
  if (holidays.has(date)) return DAY_STATUS.HOLIDAY;
  if (leaves.has(date) && isWorkDay(date, user)) return DAY_STATUS.LEAVE;
  if (date === today) return DAY_STATUS.NOT_IN;
  return isWorkDay(date, user) ? DAY_STATUS.ABSENT : DAY_STATUS.OFF;
};

export const parseMonth = (value) => {
  const month = value || monthKey();
  if (!MONTH_RE.test(month)) throw new AppError("month must look like YYYY-MM", 400);
  if (month > monthKey()) throw new AppError("month can't be in the future", 400);
  return month;
};

const monthRange = (month) => ({ $gte: `${month}-01`, $lte: `${month}-31` });

// Summarises one person's month. `days` = dates elapsed so far that count for them.
// Half days count as 0.5 towards the attendance rate; holidays are never absences.
export const summarise = (days, records, today, holidays = NO_HOLIDAYS, user = null, leaves = NO_LEAVE) => {
  const byDate = new Map(records.map((r) => [r.date, r]));
  let attended = 0;
  let onTime = 0;
  let late = 0;
  let halfDays = 0;
  let absent = 0;
  let holidayCount = 0;
  let leaveDays = 0;
  let workMinutes = 0;
  let completedDays = 0;
  let expectedDays = 0;

  for (const date of days) {
    const record = byDate.get(date);
    const status = statusFor(date, record, today, holidays, user, leaves);
    if (record) {
      attended++;
      // Late is about arrival time, so a late half day still counts as late
      if (record.status === DAY_STATUS.LATE) late++;
      if (status === DAY_STATUS.HALF_DAY) halfDays++;
      else if (status === DAY_STATUS.PRESENT) onTime++;
    }
    if (status === DAY_STATUS.ABSENT) absent++;
    if (status === DAY_STATUS.HOLIDAY) holidayCount++;
    if (status === DAY_STATUS.LEAVE) leaveDays += leaves.get(date)?.halfDay ? 0.5 : 1;
    // Expected = finished work days, plus any day they actually came in (leave isn't expected)
    if (![DAY_STATUS.OFF, DAY_STATUS.NOT_IN, DAY_STATUS.HOLIDAY, DAY_STATUS.LEAVE].includes(status)) expectedDays++;
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

  const credited = attended - halfDays * 0.5;
  return {
    present: attended, // all days they came in (late and half days included)
    onTime,
    late,
    halfDays,
    absent,
    holidays: holidayCount,
    leaveDays,
    workMinutes,
    avgWorkMinutes: completedDays ? Math.round(completedMinutes / completedDays) : null,
    attendanceRate: expectedDays ? Math.round((credited / expectedDays) * 100) : null,
  };
};

// Dates in `month` up to today, from the day the user joined
// Stops the day before an employee was deactivated.
export const countedDays = (month, user, today) => {
  const joined = dateKey(user.createdAt);
  const left = user.deactivatedAt ? dateKey(user.deactivatedAt) : null;
  return daysInMonth(month).filter((d) => d <= today && d >= joined && (!left || d < left));
};

// Was this employee on the books on `date`? (joined, and not yet deactivated)
export const activeOn = (user, date) =>
  dateKey(user.createdAt) <= date && (!user.deactivatedAt || dateKey(user.deactivatedAt) > date);

// GET /api/attendance/settings  -> company schedule defaults (any logged-in user)
export const getSettings = async (req, res) => {
  res.json({ company: companySchedule(), halfDayBelow: process.env.HALF_DAY_BELOW || "04:30" });
};

// GET /api/attendance/today
export const getToday = async (req, res) => {
  const record = await Attendance.findOne({ user: req.user._id, date: dateKey() });
  res.json({ record, policy: attendancePolicy(req.user) });
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
        status: isLate(now, req.user) ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT,
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
  const myLeave = (await loadLeaves([req.user._id], `${month}-01`, `${month}-31`)).get(req.user.id) || new Map();

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
    // dayStatus = what the calendar shows (e.g. "half_day"), status = arrival (on time / late)
    records: records.slice(0, limit).map((r) => ({ ...r.toJSON(), dayStatus: statusFor(r.date, r, dateKey(), undefined, req.user, myLeave) })),
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
  // People on the books that day (joined, not yet deactivated)
  const users = (await staffUsers()).filter((u) => activeOn(u, date));
  const [records, holidays, leaves] = await Promise.all([
    Attendance.find({ date, user: { $in: users.map((u) => u._id) } }),
    loadHolidays(date, date),
    loadLeaves(users.map((u) => u._id), date, date),
  ]);
  const byUser = new Map(records.map((r) => [String(r.user), r]));

  const rows = users.map((user) => {
    const record = byUser.get(String(user._id)) || null;
    const leave = leaves.get(String(user._id)) || new Map();
    return {
      user,
      record,
      status: statusFor(date, record, today, holidays, user, leave),
      leave: leave.get(date) || null,
    };
  });

  const count = (status) => rows.filter((r) => r.status === status).length;

  res.json({
    date,
    isToday: date === today,
    isWorkDay: isWorkDay(date) && !holidays.has(date),
    holiday: holidays.get(date) || null,
    summary: {
      total: rows.length,
      present: rows.filter((r) => r.record).length,
      late: rows.filter((r) => r.record?.status === DAY_STATUS.LATE).length,
      halfDays: count(DAY_STATUS.HALF_DAY),
      onLeave: count(DAY_STATUS.LEAVE),
      absent: count(DAY_STATUS.ABSENT),
      notIn: count(DAY_STATUS.NOT_IN),
      working: rows.filter((r) => r.record && !r.record.checkOut).length,
    },
    rows,
  });
};

// The whole month for every staff member: totals plus each day.
// Shared by the on-screen report and the Excel export so they always agree.
// `userId` limits it to one employee.
export const buildMonthlyReport = async (month, { userId } = {}) => {
  const today = dateKey();
  const monthEnd = `${month}-31`;

  // Only people who had joined by the end of that month
  // Joined by the end of the month, and not deactivated before it started
  const users = (await staffUsers(userId ? { _id: userId } : {})).filter(
    (u) => dateKey(u.createdAt) <= monthEnd && (!u.deactivatedAt || dateKey(u.deactivatedAt) > `${month}-01`)
  );
  const [records, holidays, leaves] = await Promise.all([
    Attendance.find({ date: monthRange(month), user: { $in: users.map((u) => u._id) } }),
    loadHolidays(`${month}-01`, monthEnd),
    loadLeaves(users.map((u) => u._id), `${month}-01`, monthEnd),
  ]);

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
      ...summarise(days, userRecords, today, holidays, user, leaves.get(String(user._id))),
      days: days.map((date) => {
        const record = byDate.get(date) || null;
        return { date, status: statusFor(date, record, today, holidays, user, leaves.get(String(user._id))), record };
      }),
    };
  });

  const total = (field) => rows.reduce((sum, r) => sum + r[field], 0);
  const elapsed = daysInMonth(month).filter((d) => d <= today);

  return {
    month,
    today,
    // Work days so far this month (holidays don't count)
    workingDays: elapsed.filter((d) => isWorkDay(d) && !holidays.has(d)).length,
    holidays: [...holidays].map(([date, name]) => ({ date, name })),
    summary: {
      employees: rows.length,
      present: total("present"),
      late: total("late"),
      halfDays: total("halfDays"),
      leaveDays: total("leaveDays"),
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

// One person's month, day by day (newest first), with the month's holidays.
// Used by the admin calendar and by staff for their own calendar.
const buildUserMonth = async (user, month) => {
  const today = dateKey();
  const [records, holidays, leaveMap] = await Promise.all([
    Attendance.find({ user: user._id, date: monthRange(month) }),
    loadHolidays(`${month}-01`, `${month}-31`),
    loadLeaves([user._id], `${month}-01`, `${month}-31`),
  ]);
  const leaves = leaveMap.get(String(user._id)) || new Map();
  const byDate = new Map(records.map((r) => [r.date, r]));
  const days = countedDays(month, user, today);

  return {
    month,
    user,
    joined: dateKey(user.createdAt),
    today,
    summary: summarise(days, records, today, holidays, user, leaves),
    // Whole month, including upcoming approved leave
    leaves: [...leaves].map(([date, l]) => ({ date, ...l })),
    // Whole month, including future days, so calendars can show what's coming
    holidays: [...holidays].map(([date, name]) => ({ date, name })),
    days: days
      .map((date) => {
        const record = byDate.get(date) || null;
        return { date, status: statusFor(date, record, today, holidays, user, leaves), record };
      })
      .reverse(), // newest first
  };
};

// GET /api/attendance/user/:id?month=2026-11   (admin)
export const getUserMonth = async (req, res) => {
  const month = parseMonth(req.query.month);
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found", 404);
  res.json(await buildUserMonth(user, month));
};

// GET /api/attendance/me/calendar?month=2026-11   (the logged-in employee)
export const getMyCalendar = async (req, res) => {
  res.json(await buildUserMonth(req.user, parseMonth(req.query.month)));
};
