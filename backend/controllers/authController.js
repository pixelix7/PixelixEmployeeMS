import jwt from "jsonwebtoken";
import User, { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import pick from "../utils/pick.js";

// Only these fields can be set from the request body (prevents mass assignment)
const REGISTER_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "email",
  "pan",
  "aadhar",
  "role",
  "password",
  "officeStart",
  "officeEnd",
  "graceMinutes",
  "workDays",
];

// Fields a user may change on their own profile.
// Email, role, PAN and Aadhar can only be changed by an admin.
const SELF_EDITABLE_FIELDS = ["firstName", "lastName", "phone"];

const tokenResponse = (user) => {
  const token = user.generateToken();
  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000).toISOString(), user };
};

// POST /api/auth/register
// - If no users exist yet, anyone can register and becomes the first admin.
// - After that, only a logged-in admin can create users (see routes).
export const register = async (req, res) => {
  const data = pick(req.body, REGISTER_FIELDS);

  if (req.isFirstUser) {
    data.role = ROLES.ADMIN;
  }

  const user = await User.create(data);

  res.status(201).json({
    message: req.isFirstUser ? "Admin account created" : "User created",
    user,
  });
};

// POST /api/auth/login
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    "+password"
  );

  // Same message for unknown email and wrong password, so attackers
  // can't find out which emails are registered
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password", 401);
  }

  // Checked after the password, so this doesn't reveal which emails exist
  if (user.isActive === false) {
    throw new AppError("Your account has been deactivated. Please contact your admin.", 403);
  }

  res.json(tokenResponse(user));
};

// GET /api/auth/me
export const getMe = async (req, res) => {
  res.json({ user: req.user });
};

// PATCH /api/auth/me
export const updateMe = async (req, res) => {
  const updates = pick(req.body, SELF_EDITABLE_FIELDS);

  if (Object.keys(updates).length === 0) {
    throw new AppError(
      `Only these fields can be updated: ${SELF_EDITABLE_FIELDS.join(", ")}`,
      400
    );
  }

  req.user.set(updates);
  await req.user.save();

  res.json({ message: "Profile updated", user: req.user });
};

// PATCH /api/auth/change-password
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new AppError("currentPassword and newPassword are required", 400);
  }

  const user = await User.findById(req.user.id).select("+password");

  if (!(await user.comparePassword(currentPassword))) {
    // 400, not 401: the session is valid, the input is wrong.
    // (The frontend treats any 401 as "logged out".)
    throw new AppError("Current password is incorrect", 400);
  }

  if (currentPassword === newPassword) {
    throw new AppError("New password must be different from the current one", 400);
  }

  user.password = newPassword;
  await user.save(); // old tokens stop working after this

  // Send a fresh token so this session stays logged in
  res.json({ message: "Password changed", ...tokenResponse(user) });
};
