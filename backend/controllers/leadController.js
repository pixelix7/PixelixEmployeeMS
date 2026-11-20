import Lead, { CALL_STATUS, CLOSED_STATUSES, LEAD_SOURCES } from "../models/Lead.js";
import { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import pick from "../utils/pick.js";
import { isValidPhone, normalizePhone } from "../utils/phone.js";
import { endOfDay } from "../utils/time.js";

const EDITABLE_FIELDS = ["businessName", "source", "callStatus", "notes", "followUpAt"];
const OWNER_FIELDS = "firstName lastName";

const isAdmin = (user) => user.role === ROLES.ADMIN;

// Telecallers only ever see their own leads; admins see all
const scopeFor = (user) => (isAdmin(user) ? {} : { owner: user._id });

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "" or null clears the follow-up; anything else must be a real date
const parseFollowUp = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError("Invalid follow-up date", 400);
  return date;
};

const ownerName = (owner) => (owner ? `${owner.firstName} ${owner.lastName}` : "another user");

// GET /api/leads/check?phone=9876543210
// Tells the Add Lead form, as the number is typed, whether it's already taken.
// Only the business name and owner are shared, never another telecaller's notes.
export const checkPhone = async (req, res) => {
  const phone = normalizePhone(req.query.phone || "");
  if (!isValidPhone(phone)) {
    return res.json({ phone, valid: false, exists: false });
  }

  const lead = await Lead.findOne({ phone }).populate("owner", OWNER_FIELDS);
  if (!lead) return res.json({ phone, valid: true, exists: false });

  const isMine = String(lead.owner?._id) === String(req.user._id);
  res.json({
    phone,
    valid: true,
    exists: true,
    lead: {
      _id: isMine || isAdmin(req.user) ? lead._id : undefined,
      businessName: lead.businessName,
      ownerName: ownerName(lead.owner),
      isMine,
    },
  });
};

// POST /api/leads
export const createLead = async (req, res) => {
  const data = pick(req.body, ["phone", ...EDITABLE_FIELDS]);
  data.followUpAt = parseFollowUp(data.followUpAt) ?? null;
  data.owner = req.user._id; // lock to whoever adds it
  if (data.callStatus && data.callStatus !== CALL_STATUS.NEW) data.lastContactedAt = new Date();
  if (CLOSED_STATUSES.includes(data.callStatus)) data.followUpAt = null;
  data.activity = [
    {
      kind: "added",
      by: req.user._id,
      status: data.callStatus || CALL_STATUS.NEW,
      statusChanged: false,
      note: data.notes || "",
      followUpAt: data.followUpAt,
    },
  ];

  try {
    const lead = await Lead.create(data);
    await lead.populate("owner", OWNER_FIELDS);
    res.status(201).json({ message: "Lead added", lead });
  } catch (err) {
    // Unique phone index: someone else saved this number first
    if (err.code === 11000) {
      const existing = await Lead.findOne({ phone: normalizePhone(data.phone) }).populate(
        "owner",
        OWNER_FIELDS
      );
      throw new AppError(
        `This number is already in the system, locked to ${ownerName(existing?.owner)}`,
        409
      );
    }
    throw err;
  }
};

// GET /api/leads?status=&source=&search=&owner=&page=&limit=
export const listLeads = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
  const filter = scopeFor(req.user);

  if (req.query.status) {
    if (!Object.values(CALL_STATUS).includes(req.query.status)) {
      throw new AppError("Invalid status filter", 400);
    }
    filter.callStatus = req.query.status;
  }
  if (req.query.source) {
    if (!LEAD_SOURCES.includes(req.query.source)) throw new AppError("Invalid source filter", 400);
    filter.source = req.query.source;
  }
  if (req.query.owner && isAdmin(req.user)) filter.owner = req.query.owner;

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search) {
    const or = [{ businessName: new RegExp(escapeRegex(search), "i") }];
    const digits = search.replace(/\D/g, "");
    if (digits.length >= 3) or.push({ phone: new RegExp(escapeRegex(normalizePhone(digits) || digits)) });
    filter.$or = or;
  }

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("owner", OWNER_FIELDS),
    Lead.countDocuments(filter),
  ]);

  res.json({ leads, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

// GET /api/leads/follow-ups/today
// Open leads with a follow-up due today or already overdue, earliest first
export const todaysFollowUps = async (req, res) => {
  const leads = await Lead.find({
    ...scopeFor(req.user),
    followUpAt: { $ne: null, $lte: endOfDay() },
    callStatus: { $nin: CLOSED_STATUSES },
  })
    .sort({ followUpAt: 1 })
    .limit(100)
    .populate("owner", OWNER_FIELDS);

  const now = Date.now();
  res.json({
    total: leads.length,
    overdue: leads.filter((l) => l.followUpAt < now).length,
    leads,
  });
};

// PATCH /api/leads/:id
// Only the owner (or an admin) can update. The phone number can't change.
export const updateLead = async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, ...scopeFor(req.user) });
  // 404 (not 403) so telecallers can't probe for other people's leads
  if (!lead) throw new AppError("Lead not found", 404);

  const updates = pick(req.body, EDITABLE_FIELDS);
  if (Object.keys(updates).length === 0) throw new AppError("No valid fields to update", 400);
  if ("followUpAt" in updates) updates.followUpAt = parseFollowUp(updates.followUpAt);

  const statusChanged = updates.callStatus && updates.callStatus !== lead.callStatus;
  const notesChanged = updates.notes !== undefined && updates.notes !== lead.notes;

  lead.set(updates);
  // A closed lead needs no more calls
  if (CLOSED_STATUSES.includes(lead.callStatus)) lead.followUpAt = null;
  if (statusChanged || notesChanged) {
    lead.lastContactedAt = new Date();
    // Keep a record of every call update, for daily reports
    lead.activity.push({
      kind: "update",
      by: req.user._id,
      status: lead.callStatus,
      statusChanged: Boolean(statusChanged),
      note: notesChanged ? lead.notes : "",
      followUpAt: lead.followUpAt,
    });
  }

  await lead.save();
  await lead.populate("owner", OWNER_FIELDS);
  res.json({ message: "Lead updated", lead });
};
