import mongoose from "mongoose";
import Task, { OPEN_TASK_STATUSES, TASK_STATUS } from "../models/Task.js";
import User, { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import pick from "../utils/pick.js";
import { endOfDay } from "../utils/time.js";

const PERSON = "firstName lastName role isActive";
const DETAILS = ["title", "description", "priority", "dueDate", "dueTime"];
const STAFF_STATUSES = [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.DONE];
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const POPULATE = [
  { path: "assignedTo", select: PERSON },
  { path: "assignedBy", select: "firstName lastName" },
  { path: "updates.by", select: "firstName lastName" },
];
// Works for queries and documents
const populate = (target) => target.populate(POPULATE);

const isAdmin = (user) => user.role === ROLES.ADMIN;

// Tabs: open (incl. overdue), overdue, done, cancelled, all
const tabFilter = (tab, now) => {
  switch (tab) {
    case "overdue":
      return { status: { $in: OPEN_TASK_STATUSES }, dueAt: { $lt: now } };
    case "done":
      return { status: TASK_STATUS.DONE };
    case "cancelled":
      return { status: TASK_STATUS.CANCELLED };
    case "all":
      return {};
    default:
      return { status: { $in: OPEN_TASK_STATUSES } };
  }
};
const tabSort = (tab) =>
  tab === "done" ? { completedAt: -1 } : tab === "all" || tab === "cancelled" ? { createdAt: -1 } : { dueAt: 1, createdAt: 1 };

// Employees a task can go to: active, not admins
const findAssignees = async (ids) => {
  const list = [...new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String))];
  if (!list.length) throw new AppError("Validation failed", 400, { assignedTo: "Choose at least one employee" });
  if (list.some((id) => !mongoose.isValidObjectId(id))) throw new AppError("Invalid employee", 400);
  const users = await User.find({ _id: { $in: list }, role: { $ne: ROLES.ADMIN }, isActive: { $ne: false } });
  if (users.length !== list.length) throw new AppError("Tasks can only be assigned to active employees", 400);
  return users;
};

// GET /api/tasks?tab=open|overdue|done|cancelled|all&user=&q=&page=
//   admins see everyone's tasks; employees only their own
export const listTasks = async (req, res) => {
  const now = new Date();
  const tab = req.query.tab || "open";
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);

  const scope = {};
  if (!isAdmin(req.user)) scope.assignedTo = req.user._id;
  else if (req.query.user) {
    if (!mongoose.isValidObjectId(req.query.user)) throw new AppError("Invalid employee", 400);
    scope.assignedTo = new mongoose.Types.ObjectId(req.query.user);
  }
  if (req.query.q?.trim()) scope.title = new RegExp(escapeRegex(req.query.q.trim()), "i");

  const filter = { ...scope, ...tabFilter(tab, now) };
  const [tasks, total, open, overdue, done, cancelled] = await Promise.all([
    populate(Task.find(filter).sort(tabSort(tab)).skip((page - 1) * limit).limit(limit)),
    Task.countDocuments(filter),
    Task.countDocuments({ ...scope, ...tabFilter("open", now) }),
    Task.countDocuments({ ...scope, ...tabFilter("overdue", now) }),
    Task.countDocuments({ ...scope, ...tabFilter("done", now) }),
    Task.countDocuments({ ...scope, ...tabFilter("cancelled", now) }),
  ]);

  res.json({
    tasks,
    counts: { open, overdue, done, cancelled, all: open + done + cancelled },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

// GET /api/tasks/summary -> { open, overdue, dueToday, doneThisWeek }
export const taskSummary = async (req, res) => {
  const now = new Date();
  const scope = isAdmin(req.user) ? {} : { assignedTo: req.user._id };
  const weekAgo = new Date(now.getTime() - 7 * 86400e3);
  const [open, overdue, dueToday, doneThisWeek] = await Promise.all([
    Task.countDocuments({ ...scope, status: { $in: OPEN_TASK_STATUSES } }),
    Task.countDocuments({ ...scope, status: { $in: OPEN_TASK_STATUSES }, dueAt: { $lt: now } }),
    Task.countDocuments({ ...scope, status: { $in: OPEN_TASK_STATUSES }, dueAt: { $gte: now, $lte: endOfDay() } }),
    Task.countDocuments({ ...scope, status: TASK_STATUS.DONE, completedAt: { $gte: weekAgo } }),
  ]);
  res.json({ open, overdue, dueToday, doneThisWeek });
};

// POST /api/tasks   { assignees: [id, ...], title, description, priority, dueDate, dueTime }   (admin)
// One task per employee so each person tracks their own progress
export const createTasks = async (req, res) => {
  const users = await findAssignees(req.body?.assignees ?? req.body?.assignedTo);
  const details = pick(req.body, DETAILS);

  // Validate once before writing anything
  const sample = new Task({ ...details, assignedTo: users[0]._id, assignedBy: req.user._id });
  await sample.validate();

  const tasks = await Task.insertMany(
    users.map((u) => ({
      ...details,
      assignedTo: u._id,
      assignedBy: req.user._id,
      dueAt: sample.dueAt,
      updates: [{ by: req.user._id, status: TASK_STATUS.TODO, note: "Task assigned" }],
    }))
  );
  const populated = await populate(Task.find({ _id: { $in: tasks.map((t) => t._id) } }));
  res.status(201).json({
    message: users.length === 1 ? `Task assigned to ${users[0].firstName}` : `Task assigned to ${users.length} employees`,
    tasks: populated,
  });
};

// PATCH /api/tasks/:id
//   admin:    { title, description, priority, dueDate, dueTime, assignedTo, status, note }
//   employee: { status (todo|in_progress|done), note } on their own task
export const updateTask = async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw new AppError("Task not found", 404);

  const admin = isAdmin(req.user);
  const body = req.body || {};
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const status = body.status;

  if (!admin) {
    if (String(task.assignedTo) !== String(req.user._id)) throw new AppError("Task not found", 404);
    if (task.status === TASK_STATUS.CANCELLED) throw new AppError("This task was cancelled by the admin", 400);
    if (status !== undefined && !STAFF_STATUSES.includes(status)) throw new AppError("Choose a valid status", 400);
  } else {
    task.set(pick(body, DETAILS));
    if (body.assignedTo && String(body.assignedTo) !== String(task.assignedTo)) {
      const [user] = await findAssignees([body.assignedTo]);
      task.assignedTo = user._id;
      task.updates.push({ by: req.user._id, note: `Reassigned to ${user.firstName} ${user.lastName}` });
    }
  }

  const statusChanged = status !== undefined && status !== task.status;
  if (statusChanged) task.status = status;
  if (statusChanged || note) {
    task.updates.push({ by: req.user._id, status: statusChanged ? status : null, note });
  }

  await task.save();
  await populate(task);
  res.json({ message: "Task updated", task });
};

// DELETE /api/tasks/:id   (admin)
export const deleteTask = async (req, res) => {
  const task = await Task.findByIdAndDelete(req.params.id);
  if (!task) throw new AppError("Task not found", 404);
  res.json({ message: "Task deleted" });
};
