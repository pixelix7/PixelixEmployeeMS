import WorkItem, {
  CLOSED_WORK_STATUSES,
  WORK_CATEGORIES,
  WORK_STATUS,
} from "../models/WorkItem.js";
import User, { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import { DATE_RE, dateKey, endOfDay, startOfDay } from "../utils/time.js";

const PEOPLE = "firstName lastName role";
const isAdmin = (user) => user.role === ROLES.ADMIN;
const scopeFor = (user) => (isAdmin(user) ? {} : { owner: user._id });

const withPeople = (query) =>
  query.populate("owner", PEOPLE).populate("assignedBy", PEOPLE).populate("updates.by", PEOPLE);

const clean = (v) => (typeof v === "string" ? v.trim() : v);

const parseDue = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError("Invalid due date", 400);
  return d;
};

// POST /api/work
// Digital marketers log their own work. Admins assign tasks to a digital marketer.
export const createWorkItem = async (req, res) => {
  const body = req.body || {};
  const admin = isAdmin(req.user);

  let owner = req.user._id;
  let assignedBy = null;
  let category = clean(body.category);

  if (admin) {
    const target = body.owner && (await User.findById(body.owner));
    if (!target || target.role !== ROLES.DIGITAL_MARKETING) {
      throw new AppError("Choose a digital marketing team member to assign this to", 400);
    }
    owner = target._id;
    assignedBy = req.user._id;
    category = category || WORK_CATEGORIES.ASSIGNED;
  } else if (category === WORK_CATEGORIES.ASSIGNED) {
    throw new AppError("Assigned tasks come from an admin — pick another category", 400);
  }

  const status = clean(body.status) || WORK_STATUS.PENDING;
  const firstNote = clean(body.note) || "";

  const item = new WorkItem({
    owner,
    assignedBy,
    category,
    title: clean(body.title),
    client: clean(body.client) || "",
    details: clean(body.details) || "",
    status,
    dueDate: parseDue(body.dueDate) ?? null,
    date: dateKey(),
    updates: [{ by: req.user._id, status, note: firstNote || (assignedBy ? "Task assigned" : "") }],
  });
  await item.save();

  res.status(201).json({ message: assignedBy ? "Task assigned" : "Work added", item: await withPeople(WorkItem.findById(item._id)) });
};

// GET /api/work/board
// The digital marketer dashboard: everything still open, what was closed today, and counts
export const getBoard = async (req, res) => {
  const owner = isAdmin(req.user) && req.query.owner ? req.query.owner : req.user._id;
  const today = dateKey();
  const dayStart = startOfDay(today);
  const monthStart = startOfDay(`${today.slice(0, 7)}-01`);

  const [open, doneToday, closedThisMonth] = await Promise.all([
    withPeople(
      WorkItem.find({ owner, status: { $nin: CLOSED_WORK_STATUSES } }).sort({ dueDate: 1, createdAt: 1 })
    ),
    withPeople(
      WorkItem.find({ owner, closedAt: { $gte: dayStart } }).sort({ closedAt: -1 })
    ),
    WorkItem.find({ owner, closedAt: { $gte: monthStart } }).select("status category"),
  ]);

  // Assigned tasks first, then by due date (no due date last)
  open.sort((a, b) => {
    if (Boolean(a.assignedBy) !== Boolean(b.assignedBy)) return a.assignedBy ? -1 : 1;
    const ad = a.dueDate ? a.dueDate.getTime() : Infinity;
    const bd = b.dueDate ? b.dueDate.getTime() : Infinity;
    return ad - bd;
  });

  const count = (list, status) => list.filter((i) => i.status === status).length;
  const now = Date.now();

  res.json({
    date: today,
    stats: {
      open: open.length,
      overdue: open.filter((i) => i.dueDate && i.dueDate.getTime() < now).length,
      doneToday: doneToday.filter((i) => i.status !== WORK_STATUS.CANCELLED).length,
      wonThisMonth: count(closedThisMonth, WORK_STATUS.WON),
      lostThisMonth: count(closedThisMonth, WORK_STATUS.LOST),
    },
    open,
    doneToday,
  });
};

// GET /api/work?date=&category=&status=&owner=&page=&limit=
// The work log. `date` matches items logged that day or closed that day.
export const listWork = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
  const filter = scopeFor(req.user);

  if (req.query.category) {
    if (!Object.values(WORK_CATEGORIES).includes(req.query.category)) {
      throw new AppError("Invalid category filter", 400);
    }
    filter.category = req.query.category;
  }
  if (req.query.status) {
    if (req.query.status === "open") filter.status = { $nin: CLOSED_WORK_STATUSES };
    else if (Object.values(WORK_STATUS).includes(req.query.status)) filter.status = req.query.status;
    else throw new AppError("Invalid status filter", 400);
  }
  if (req.query.owner && isAdmin(req.user)) filter.owner = req.query.owner;
  if (req.query.date) {
    if (!DATE_RE.test(req.query.date)) throw new AppError("date must look like YYYY-MM-DD", 400);
    const d = req.query.date;
    filter.$or = [{ date: d }, { closedAt: { $gte: startOfDay(d), $lte: endOfDay(d) } }];
  }

  const [items, total] = await Promise.all([
    withPeople(
      WorkItem.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
    ),
    WorkItem.countDocuments(filter),
  ]);

  res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

// PATCH /api/work/:id  { status?, note?, title?, client?, details?, dueDate?, category? }
// A status change or note is added to the item's history.
// On assigned tasks, the marketer can only change status and add notes.
export const updateWorkItem = async (req, res) => {
  const item = await WorkItem.findOne({ _id: req.params.id, ...scopeFor(req.user) });
  if (!item) throw new AppError("Work item not found", 404);

  const body = req.body || {};
  const admin = isAdmin(req.user);
  const canEditDetails = admin || !item.assignedBy;

  if (canEditDetails) {
    for (const field of ["title", "client", "details"]) {
      if (body[field] !== undefined) item[field] = clean(body[field]);
    }
    if (body.dueDate !== undefined) item.dueDate = parseDue(body.dueDate);
    if (body.category !== undefined) {
      if (!admin && body.category === WORK_CATEGORIES.ASSIGNED) {
        throw new AppError("Assigned tasks come from an admin — pick another category", 400);
      }
      item.category = body.category;
    }
  }

  const newStatus = clean(body.status);
  const note = clean(body.note) || "";
  const statusChanged = newStatus && newStatus !== item.status;
  if (statusChanged) item.status = newStatus;

  if (statusChanged || note) {
    item.updates.push({ by: req.user._id, status: statusChanged ? newStatus : null, note });
  }

  if (!item.isModified()) throw new AppError("Nothing to update", 400);
  await item.save();

  res.json({ message: "Work updated", item: await withPeople(WorkItem.findById(item._id)) });
};

// DELETE /api/work/:id
// Admins can delete anything; marketers only their own (not assigned) entries
export const deleteWorkItem = async (req, res) => {
  const item = await WorkItem.findOne({ _id: req.params.id, ...scopeFor(req.user) });
  if (!item) throw new AppError("Work item not found", 404);
  if (!isAdmin(req.user) && item.assignedBy) {
    throw new AppError("Assigned tasks can't be deleted — mark them Cancelled instead", 403);
  }
  await item.deleteOne();
  res.json({ message: "Work item deleted" });
};
