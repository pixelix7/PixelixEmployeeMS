import mongoose from "mongoose";
import Project, { ACTIVE_PROJECT_STATUS, PROJECT_STATUS } from "../models/Project.js";
import Client from "../models/Client.js";
import User, { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import pick from "../utils/pick.js";
import { dateKey } from "../utils/time.js";

const DETAILS = ["name", "description", "status", "priority", "startDate", "dueDate", "progress"];
const STATUS_LABEL = {
  planning: "Planning",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};
const PERSON = "firstName lastName role email phone isActive";
// Employees on the project need the client's contact details, not its contract or notes
const CLIENT_PUBLIC = "name contactPerson phone altPhone email website city industry status";

const POPULATE = [
  { path: "client", select: CLIENT_PUBLIC },
  { path: "team", select: PERSON },
  { path: "createdBy", select: "firstName lastName" },
  { path: "updates.by", select: "firstName lastName" },
];

const isAdmin = (user) => user.role === ROLES.ADMIN;
const fullName = (u) => `${u.firstName} ${u.lastName}`;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const onTeam = (project, user) => project.team.some((m) => String(m._id || m) === String(user._id));

// Team members must be active employees (not admins)
const findStaff = async (ids) => {
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
  if (list.some((id) => !mongoose.isValidObjectId(id))) throw new AppError("Invalid employee", 400);
  if (!list.length) return [];
  const users = await User.find({ _id: { $in: list }, role: { $ne: ROLES.ADMIN }, isActive: { $ne: false } });
  if (users.length !== list.length) throw new AppError("Projects can only be assigned to active employees", 400);
  return users;
};

const findClient = async (id) => {
  if (!id || !mongoose.isValidObjectId(id)) throw new AppError("Validation failed", 400, { client: "Choose a client" });
  const client = await Client.findById(id);
  if (!client) throw new AppError("Validation failed", 400, { client: "That client no longer exists" });
  return client;
};

const teamNote = (before, after) => {
  const was = new Set(before.map((u) => String(u._id)));
  const now = new Set(after.map((u) => String(u._id)));
  const added = after.filter((u) => !was.has(String(u._id))).map(fullName);
  const removed = before.filter((u) => !now.has(String(u._id))).map(fullName);
  return [added.length && `Added ${added.join(", ")}`, removed.length && `Removed ${removed.join(", ")}`]
    .filter(Boolean)
    .join(" · ");
};

// Tabs: active (planning + in progress), on_hold, completed, all (+ any exact status)
const tabFilter = (tab) => {
  if (!tab || tab === "active") return { status: { $in: ACTIVE_PROJECT_STATUS } };
  if (tab === "all") return {};
  if (!PROJECT_STATUS.includes(tab)) throw new AppError("Invalid status filter", 400);
  return { status: tab };
};

// GET /api/projects?tab=active|on_hold|completed|cancelled|all&client=&member=&q=
//   admins: every project; employees: projects they're on
export const listProjects = async (req, res) => {
  const scope = {};
  if (!isAdmin(req.user)) scope.team = req.user._id;
  else if (req.query.member) {
    if (!mongoose.isValidObjectId(req.query.member)) throw new AppError("Invalid employee", 400);
    scope.team = new mongoose.Types.ObjectId(req.query.member);
  }
  if (req.query.client) {
    if (!mongoose.isValidObjectId(req.query.client)) throw new AppError("Invalid client", 400);
    scope.client = new mongoose.Types.ObjectId(req.query.client);
  }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    const clients = await Client.find({ name: regex }).select("_id");
    scope.$or = [{ name: regex }, { client: { $in: clients.map((c) => c._id) } }];
  }

  const [projects, byStatus] = await Promise.all([
    Project.find({ ...scope, ...tabFilter(req.query.tab) })
      // Soonest deadline first; projects without one after
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(200)
      .select("-updates")
      .populate([
        { path: "client", select: "name city" },
        { path: "team", select: PERSON },
      ]),
    Project.aggregate([{ $match: scope }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);

  const counts = Object.fromEntries(PROJECT_STATUS.map((s) => [s, 0]));
  for (const s of byStatus) counts[s._id] = s.n;
  counts.active = counts.planning + counts.in_progress;
  counts.all = PROJECT_STATUS.reduce((n, s) => n + counts[s], 0);

  // Nulls sort first in Mongo; put projects without a deadline last
  projects.sort((a, b) => (a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1));
  res.json({ projects, counts, today: dateKey() });
};

// GET /api/projects/:id
export const getProject = async (req, res) => {
  const project = await Project.findById(req.params.id).populate(POPULATE);
  if (!project || (!isAdmin(req.user) && !onTeam(project, req.user))) throw new AppError("Project not found", 404);
  res.json({ project });
};

// POST /api/projects   (admin)
export const createProject = async (req, res) => {
  const [client, team] = await Promise.all([findClient(req.body?.client), findStaff(req.body?.team)]);
  const project = new Project({
    ...pick(req.body, DETAILS),
    client: client._id,
    team: team.map((u) => u._id),
    createdBy: req.user._id,
    updates: [
      { by: req.user._id, note: "Project created" },
      ...(team.length ? [{ by: req.user._id, note: teamNote([], team) }] : []),
    ],
  });
  await project.save();
  await project.populate(POPULATE);
  res.status(201).json({ message: `Project created for ${client.name}`, project });
};

// PATCH /api/projects/:id   (admin) details, client, team
export const updateProject = async (req, res) => {
  const project = await Project.findById(req.params.id).populate("team", PERSON);
  if (!project) throw new AppError("Project not found", 404);

  const notes = [];
  const before = { status: project.status, progress: project.progress };
  const data = pick(req.body, DETAILS);
  project.set(data);

  if (req.body?.client && String(req.body.client) !== String(project.client)) {
    const client = await findClient(req.body.client);
    project.client = client._id;
    notes.push(`Moved to client ${client.name}`);
  }
  if (Array.isArray(req.body?.team)) {
    const current = project.team;
    const keep = new Set(current.map((u) => String(u._id)));
    const wanted = req.body.team.map(String);
    const added = await findStaff(wanted.filter((id) => !keep.has(id)));
    const after = [...current.filter((u) => wanted.includes(String(u._id))), ...added];
    const note = teamNote(current, after);
    project.team = after.map((u) => u._id);
    if (note) notes.push(note);
  }

  const statusChanged = project.status !== before.status;
  const detailKeys = ["name", "description", "priority", "startDate", "dueDate"];
  if (detailKeys.some((k) => k in data && project.isModified(k))) notes.push("Details updated");
  // completed forces 100% in the hook; record progress changes made directly
  const progressChanged = "progress" in data && Number(data.progress) !== before.progress && !statusChanged;

  if (notes.length || statusChanged || progressChanged) {
    project.updates.push({
      by: req.user._id,
      note: notes.join(" · "),
      status: statusChanged ? project.status : null,
      progress: progressChanged ? project.progress : null,
    });
  }

  await project.save();
  await project.populate(POPULATE);
  res.json({ message: "Project updated", project });
};

// POST /api/projects/:id/updates   { note, progress? }  (team member or admin)
// A progress update from someone working on it
export const addUpdate = async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project || (!isAdmin(req.user) && !onTeam(project, req.user))) throw new AppError("Project not found", 404);
  if (["completed", "cancelled"].includes(project.status) && !isAdmin(req.user)) {
    throw new AppError(`This project is ${STATUS_LABEL[project.status].toLowerCase()} — no more updates`, 400);
  }

  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  const hasProgress = req.body?.progress !== undefined && req.body.progress !== "" && req.body.progress !== null;
  const progress = hasProgress ? Math.round(Number(req.body.progress)) : null;
  if (hasProgress && (Number.isNaN(progress) || progress < 0 || progress > 100)) {
    throw new AppError("Validation failed", 400, { progress: "Progress must be between 0 and 100" });
  }
  const progressChanged = hasProgress && progress !== project.progress;
  if (!note && !progressChanged) throw new AppError("Validation failed", 400, { note: "Write an update or change the progress" });
  if (note.length > 1000) throw new AppError("Validation failed", 400, { note: "Update is too long" });

  if (progressChanged) project.progress = progress;
  // First update on a project still in planning moves it to in progress
  const started = project.status === "planning" && !isAdmin(req.user);
  if (started) project.status = "in_progress";
  project.updates.push({
    by: req.user._id,
    note,
    progress: progressChanged ? progress : null,
    status: started ? "in_progress" : null,
  });

  await project.save();
  await project.populate(POPULATE);
  res.status(201).json({ message: "Update posted", project });
};

// DELETE /api/projects/:id   (admin)
export const deleteProject = async (req, res) => {
  const project = await Project.findByIdAndDelete(req.params.id);
  if (!project) throw new AppError("Project not found", 404);
  res.json({ message: "Project deleted" });
};
