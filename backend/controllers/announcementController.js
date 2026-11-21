import Announcement from "../models/Announcement.js";
import User, { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";
import pick from "../utils/pick.js";
import { dateKey } from "../utils/time.js";

const EDITABLE = ["title", "message", "audience", "priority", "pinned", "expiresOn"];
const ORDER = { pinned: -1, createdAt: -1 };
const AUTHOR = "firstName lastName";

// Announcements this employee should see right now
const visibleTo = (user) => ({
  audience: { $in: ["all", user.role] },
  $or: [{ expiresOn: null }, { expiresOn: { $gte: dateKey() } }],
});

// GET /api/announcements
//   employees: what's live for their team, with isRead + unread count
//   admins:    everything (incl. expired), with how many of the audience have seen it
export const listAnnouncements = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

  if (req.user.role !== ROLES.ADMIN) {
    const docs = await Announcement.find(visibleTo(req.user))
      .sort(ORDER)
      .limit(limit)
      .select("+readBy")
      .populate("createdBy", AUTHOR);
    const me = String(req.user._id);
    const announcements = docs.map((a) => {
      const { readBy, ...rest } = a.toObject();
      return { ...rest, isRead: readBy.some((id) => String(id) === me) };
    });
    return res.json({ announcements, unread: announcements.filter((a) => !a.isRead).length });
  }

  const [docs, teams] = await Promise.all([
    Announcement.find().sort(ORDER).limit(limit).select("+readBy").populate("createdBy", AUTHOR),
    User.aggregate([
      { $match: { isActive: { $ne: false }, role: { $ne: ROLES.ADMIN } } },
      { $group: { _id: "$role", n: { $sum: 1 } } },
    ]),
  ]);
  const teamSize = Object.fromEntries(teams.map((t) => [t._id, t.n]));
  const everyone = Object.values(teamSize).reduce((a, b) => a + b, 0);
  const today = dateKey();
  const announcements = docs.map((a) => {
    const { readBy, ...rest } = a.toObject();
    return {
      ...rest,
      readCount: readBy.length,
      audienceSize: a.audience === "all" ? everyone : teamSize[a.audience] || 0,
      expired: Boolean(a.expiresOn && a.expiresOn < today),
    };
  });
  res.json({ announcements });
};

// POST /api/announcements   (admin)
export const createAnnouncement = async (req, res) => {
  const announcement = await Announcement.create({ ...pick(req.body, EDITABLE), createdBy: req.user._id });
  await announcement.populate("createdBy", AUTHOR);
  res.status(201).json({ message: "Announcement posted", announcement });
};

// PATCH /api/announcements/:id   (admin)
export const updateAnnouncement = async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) throw new AppError("Announcement not found", 404);
  announcement.set(pick(req.body, EDITABLE));
  await announcement.save();
  await announcement.populate("createdBy", AUTHOR);
  res.json({ message: "Announcement updated", announcement });
};

// DELETE /api/announcements/:id   (admin)
export const deleteAnnouncement = async (req, res) => {
  const announcement = await Announcement.findByIdAndDelete(req.params.id);
  if (!announcement) throw new AppError("Announcement not found", 404);
  res.json({ message: "Announcement deleted" });
};

// POST /api/announcements/read   { ids?: [] }   (employee)
// Marks the given announcements (or everything visible) as seen
export const markRead = async (req, res) => {
  const filter = visibleTo(req.user);
  if (Array.isArray(req.body?.ids)) filter._id = { $in: req.body.ids };
  const { modifiedCount } = await Announcement.updateMany(filter, { $addToSet: { readBy: req.user._id } });
  res.json({ marked: modifiedCount });
};
