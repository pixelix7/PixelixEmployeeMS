import crypto from "node:crypto";
import User, { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import pick from "../utils/pick.js";
import { buildEmployeeProfile } from "../utils/employeeProfile.js";
import { MONTH_RE, monthKey } from "../utils/time.js";

// Fields an admin may change through PATCH /api/users/:id.
// Password has its own route so it is never changed by accident.
const ADMIN_EDITABLE_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "email",
  "pan",
  "aadhar",
  "role",
  // Work schedule (null / [] = use the company schedule)
  "officeStart",
  "officeEnd",
  "graceMinutes",
  "workDays",
  // Account status
  "isActive",
];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findUserOr404 = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new AppError("User not found", 404);
  return user;
};

// Blocks any change that would leave the system with no admin
const ensureNotLastAdmin = async (user, action) => {
  if (user.role !== ROLES.ADMIN || !user.isActive) return;
  // Only active admins can actually run the system
  const adminCount = await User.countDocuments({ role: ROLES.ADMIN, isActive: { $ne: false } });
  if (adminCount <= 1) {
    throw new AppError(`Cannot ${action} the only admin`, 400);
  }
};

// GET /api/users?role=telecaller&search=ravi&page=1&limit=20
export const listUsers = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

  const filter = {};

  // ?status=active | inactive
  if (req.query.status === "active") filter.isActive = { $ne: false };
  else if (req.query.status === "inactive") filter.isActive = false;
  else if (req.query.status) throw new AppError("Invalid status filter", 400);

  if (req.query.role) {
    if (!Object.values(ROLES).includes(req.query.role)) {
      throw new AppError("Invalid role filter", 400);
    }
    filter.role = req.query.role;
  }

  if (typeof req.query.search === "string" && req.query.search.trim()) {
    const regex = new RegExp(escapeRegex(req.query.search.trim()), "i");
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { phone: regex },
      { employeeId: regex },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  res.json({
    users,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

// GET /api/users/stats -> { total, byRole: { admin, telecaller, digital_marketing } }
// Counts active employees only; deactivated ones are reported separately
export const getUserStats = async (req, res) => {
  const [groups, inactive] = await Promise.all([
    User.aggregate([
      { $match: { isActive: { $ne: false } } },
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]),
    User.countDocuments({ isActive: false }),
  ]);

  const byRole = Object.fromEntries(Object.values(ROLES).map((role) => [role, 0]));
  for (const { _id, count } of groups) byRole[_id] = count;

  const total = Object.values(byRole).reduce((sum, n) => sum + n, 0);
  res.json({ total, byRole, inactive });
};

// GET /api/users/:id
export const getUser = async (req, res) => {
  const user = await findUserOr404(req.params.id);
  res.json({ user });
};

// PATCH /api/users/:id
export const updateUser = async (req, res) => {
  const user = await findUserOr404(req.params.id);
  const updates = pick(req.body, ADMIN_EDITABLE_FIELDS);

  if (Object.keys(updates).length === 0) {
    throw new AppError("No valid fields to update", 400);
  }

  if (updates.role && updates.role !== user.role) {
    await ensureNotLastAdmin(user, "change the role of");
  }

  if ("isActive" in updates) {
    updates.isActive = Boolean(updates.isActive);
    if (!updates.isActive && user.isActive) {
      if (user.id === req.user.id) throw new AppError("You can't deactivate your own account", 400);
      await ensureNotLastAdmin(user, "deactivate");
    }
  }

  // An empty value means "use the company schedule"
  for (const field of ["officeStart", "officeEnd"]) {
    if (updates[field] === "") updates[field] = null;
  }
  if (updates.graceMinutes === "") updates.graceMinutes = null;
  if (updates.workDays === null) updates.workDays = [];

  const wasActive = user.isActive;
  user.set(updates);
  await user.save(); // save() runs schema validators

  const message =
    wasActive && !user.isActive
      ? `${user.firstName} has been deactivated`
      : !wasActive && user.isActive
        ? `${user.firstName} has been reactivated`
        : "User updated";
  res.json({ message, user });
};

// PATCH /api/users/:id/password  (admin resets someone's password)
export const resetUserPassword = async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) throw new AppError("newPassword is required", 400);

  const user = await findUserOr404(req.params.id);
  user.password = newPassword;
  await user.save(); // hashes it and logs the user out everywhere

  res.json({ message: "Password reset. The user must log in again." });
};

// DELETE /api/users/:id
export const deleteUser = async (req, res) => {
  if (req.params.id === req.user.id) {
    throw new AppError("You cannot delete your own account", 400);
  }

  const user = await findUserOr404(req.params.id);
  await ensureNotLastAdmin(user, "delete");
  await user.deleteOne();

  res.json({ message: "User deleted" });
};

/* ---------------- Bulk create ---------------- */

const BULK_LIMIT = 100;
const BULK_FIELDS = ["firstName", "lastName", "phone", "email", "pan", "aadhar", "role", "password"];

// 12-character password with upper, lower, digit and symbol (no look-alike characters)
const generatePassword = () => {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "@#$%&*!"];
  const all = sets.join("");
  const pickFrom = (s) => s[crypto.randomInt(s.length)];
  const chars = sets.map(pickFrom);
  while (chars.length < 12) chars.push(pickFrom(all));
  // Shuffle so the guaranteed characters aren't always first
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

const clean = (value) => (typeof value === "string" ? value.trim() : value);

// POST /api/users/bulk  { users: [{ firstName, lastName, phone, email, role, pan?, aadhar?, password? }] }
// Creates each row on its own: a bad row is reported and the rest still go through.
export const bulkCreateUsers = async (req, res) => {
  const rows = req.body?.users;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError("Send a non-empty `users` array", 400);
  }
  if (rows.length > BULK_LIMIT) {
    throw new AppError(`You can upload at most ${BULK_LIMIT} users at a time`, 400);
  }

  // Catch duplicates inside the file itself before touching the database
  const seen = { email: new Map(), pan: new Map(), aadhar: new Map() };
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = Number(rows[i]?.row) || i + 1; // row number in the admin's file
    const data = Object.fromEntries(
      Object.entries(pick(rows[i] || {}, BULK_FIELDS)).map(([k, v]) => [k, clean(v)])
    );
    if (data.email) data.email = data.email.toLowerCase();
    if (data.pan) data.pan = data.pan.toUpperCase();

    const errors = {};
    for (const field of ["email", "pan", "aadhar"]) {
      const value = data[field];
      if (!value) continue;
      if (seen[field].has(value)) {
        errors[field] = `Same ${field} as row ${seen[field].get(value)} in this file`;
      } else {
        seen[field].set(value, rowNumber);
      }
    }
    let generatedPassword;
    if (!data.password) {
      generatedPassword = generatePassword();
      data.password = generatedPassword;
    }

    if (Object.keys(errors).length) {
      results.push({ row: rowNumber, email: data.email, ok: false, errors });
      continue;
    }

    try {
      const user = await User.create(data);
      results.push({
        row: rowNumber,
        ok: true,
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
        },
        ...(generatedPassword && { generatedPassword }),
      });
    } catch (err) {
      if (err.name === "ValidationError") {
        const fieldErrors = Object.fromEntries(
          Object.entries(err.errors).map(([field, e]) => [field, e.message])
        );
        results.push({ row: rowNumber, email: data.email, ok: false, errors: fieldErrors });
      } else if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0] || "field";
        results.push({
          row: rowNumber,
          email: data.email,
          ok: false,
          errors: { [field]: `A user with this ${field} already exists` },
        });
      } else {
        throw err;
      }
    }
  }

  const created = results.filter((r) => r.ok).length;
  // Always 200: this is a per-row report, even when every row failed
  res.json({
    message: `${created} of ${rows.length} users created`,
    created,
    failed: rows.length - created,
    results,
  });
};

/* ---------------- Employee profile ---------------- */

// GET /api/users/:id/profile?month=2026-11
export const getEmployeeProfile = async (req, res) => {
  const month = req.query.month || monthKey();
  if (!MONTH_RE.test(month)) throw new AppError("month must look like YYYY-MM", 400);
  if (month > monthKey()) throw new AppError("month can't be in the future", 400);
  res.json(await buildEmployeeProfile(req.params.id, month));
};
