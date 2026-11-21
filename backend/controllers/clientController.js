import mongoose from "mongoose";
import Client, { CLIENT_STATUS } from "../models/Client.js";
import User, { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import pick from "../utils/pick.js";
import { dateKey } from "../utils/time.js";

const EDITABLE = [
  "name",
  "contactPerson",
  "phone",
  "altPhone",
  "email",
  "website",
  "industry",
  "address",
  "city",
  "gstNumber",
  "joinedOn",
  "contractNumber",
  "contractStart",
  "contractEnd",
  "contractValue",
  "services",
  "status",
  "notes",
];
const STATUS_LABEL = { active: "Active", on_hold: "On hold", inactive: "Inactive" };
const PERSON = "firstName lastName role email phone isActive";

const POPULATE = [
  { path: "assignedTo", select: PERSON },
  { path: "createdBy", select: "firstName lastName" },
  { path: "history.by", select: "firstName lastName" },
];

const isAdmin = (user) => user.role === ROLES.ADMIN;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fullName = (u) => `${u.firstName} ${u.lastName}`;

// Empty number field from a form -> null
const cleanValue = (body) => {
  const data = pick(body, EDITABLE);
  if (data.contractValue === "" || data.contractValue === undefined) {
    if ("contractValue" in data) data.contractValue = null;
  }
  return data;
};

// Duplicate contract number -> friendly message
const saveClient = async (client) => {
  try {
    await client.save();
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError("Validation failed", 409, { contractNumber: "Another client already has this contract number" });
    }
    throw err;
  }
};

// Employees a client can be assigned to: active, not admins
const findStaff = async (ids) => {
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
  if (list.some((id) => !mongoose.isValidObjectId(id))) throw new AppError("Invalid employee", 400);
  if (!list.length) return [];
  const users = await User.find({ _id: { $in: list }, role: { $ne: ROLES.ADMIN }, isActive: { $ne: false } });
  if (users.length !== list.length) throw new AppError("Clients can only be assigned to active employees", 400);
  return users;
};

// Records who was added / removed in the client's history
const assignmentNote = (before, after) => {
  const was = new Map(before.map((u) => [String(u._id), u]));
  const now = new Map(after.map((u) => [String(u._id), u]));
  const added = after.filter((u) => !was.has(String(u._id))).map(fullName);
  const removed = before.filter((u) => !now.has(String(u._id))).map(fullName);
  const parts = [];
  if (added.length) parts.push(`Assigned to ${added.join(", ")}`);
  if (removed.length) parts.push(`Removed ${removed.join(", ")}`);
  return parts.join(" · ");
};

// GET /api/clients?q=&status=&assignee=<id>|unassigned&page=
//   admins: every client; employees: only clients assigned to them
export const listClients = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

  const scope = {};
  if (!isAdmin(req.user)) scope.assignedTo = req.user._id;
  else if (req.query.assignee === "unassigned") scope.assignedTo = { $size: 0 };
  else if (req.query.assignee) {
    if (!mongoose.isValidObjectId(req.query.assignee)) throw new AppError("Invalid employee", 400);
    scope.assignedTo = new mongoose.Types.ObjectId(req.query.assignee);
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    const digits = q.replace(/\D/g, "");
    scope.$or = [{ name: regex }, { contactPerson: regex }, { email: regex }, { contractNumber: regex }, { city: regex }];
    if (digits.length >= 3) scope.$or.push({ phone: new RegExp(digits) }, { altPhone: new RegExp(digits) });
  }

  const filter = { ...scope };
  if (req.query.status) {
    if (!CLIENT_STATUS.includes(req.query.status)) throw new AppError("Invalid status filter", 400);
    filter.status = req.query.status;
  }

  const [clients, total, byStatus, unassigned] = await Promise.all([
    Client.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-history")
      .populate("assignedTo", PERSON),
    Client.countDocuments(filter),
    Client.aggregate([{ $match: scope }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    isAdmin(req.user) ? Client.countDocuments({ ...scope, assignedTo: { $size: 0 } }) : 0,
  ]);

  const counts = Object.fromEntries(CLIENT_STATUS.map((s) => [s, 0]));
  for (const s of byStatus) counts[s._id] = s.n;
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);

  res.json({ clients, counts, unassigned, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

// GET /api/clients/:id
export const getClient = async (req, res) => {
  const client = await Client.findById(req.params.id).populate(POPULATE);
  const mine = client?.assignedTo.some((u) => String(u._id) === String(req.user._id));
  if (!client || (!isAdmin(req.user) && !mine)) throw new AppError("Client not found", 404);
  res.json({ client });
};

// POST /api/clients   (admin)  { ...details, assignedTo: [ids] }
export const createClient = async (req, res) => {
  const staff = await findStaff(req.body?.assignedTo);
  const client = new Client({
    joinedOn: dateKey(),
    ...cleanValue(req.body),
    assignedTo: staff.map((u) => u._id),
    createdBy: req.user._id,
    history: [
      { by: req.user._id, note: "Client added" },
      ...(staff.length ? [{ by: req.user._id, note: assignmentNote([], staff) }] : []),
    ],
  });
  await saveClient(client);
  await client.populate(POPULATE);
  res.status(201).json({ message: "Client added", client });
};

// PATCH /api/clients/:id   (admin)  any details, and/or assignedTo: [ids]
export const updateClient = async (req, res) => {
  const client = await Client.findById(req.params.id).populate("assignedTo", PERSON);
  if (!client) throw new AppError("Client not found", 404);

  const before = client.assignedTo;
  const data = cleanValue(req.body);
  const oldStatus = client.status;
  client.set(data);

  if (Array.isArray(req.body?.assignedTo)) {
    // People already on the client may have been deactivated since; keep them if unchanged
    const keep = new Set(before.map((u) => String(u._id)));
    const newIds = req.body.assignedTo.map(String).filter((id) => !keep.has(id));
    const added = await findStaff(newIds);
    const after = [
      ...before.filter((u) => req.body.assignedTo.map(String).includes(String(u._id))),
      ...added,
    ];
    const note = assignmentNote(before, after);
    client.assignedTo = after.map((u) => u._id);
    if (note) client.history.push({ by: req.user._id, note });
  }
  if (data.status && data.status !== oldStatus) {
    client.history.push({ by: req.user._id, note: `Status changed to ${STATUS_LABEL[data.status] || data.status}` });
  }
  const changed = Object.keys(data).filter((k) => k !== "status" && client.isModified(k));
  if (changed.length) client.history.push({ by: req.user._id, note: "Details updated" });

  await saveClient(client);
  await client.populate(POPULATE);
  res.json({ message: "Client updated", client });
};

// POST /api/clients/assign   (admin)
//   { clientIds: [], userIds: [], mode: "add" | "replace" }
// Assign several clients at once
export const bulkAssign = async (req, res) => {
  const { clientIds, userIds, mode = "add" } = req.body || {};
  if (!Array.isArray(clientIds) || !clientIds.length) throw new AppError("Select at least one client", 400);
  if (clientIds.some((id) => !mongoose.isValidObjectId(id))) throw new AppError("Invalid client", 400);
  if (!["add", "replace"].includes(mode)) throw new AppError("mode must be add or replace", 400);
  const staff = await findStaff(userIds);
  if (!staff.length && mode === "add") throw new AppError("Choose at least one employee", 400);

  const clients = await Client.find({ _id: { $in: clientIds } }).populate("assignedTo", PERSON);
  if (clients.length !== new Set(clientIds.map(String)).size) throw new AppError("Some clients were not found", 404);

  for (const client of clients) {
    const before = client.assignedTo;
    const after =
      mode === "replace"
        ? staff
        : [...before, ...staff.filter((u) => !before.some((b) => String(b._id) === String(u._id)))];
    const note = assignmentNote(before, after);
    if (!note) continue;
    client.assignedTo = after.map((u) => u._id);
    client.history.push({ by: req.user._id, note });
    await client.save();
  }

  res.json({ message: `${clients.length} client${clients.length === 1 ? "" : "s"} updated` });
};

// DELETE /api/clients/:id   (admin)
export const deleteClient = async (req, res) => {
  const client = await Client.findByIdAndDelete(req.params.id);
  if (!client) throw new AppError("Client not found", 404);
  res.json({ message: "Client deleted" });
};
