import mongoose from "mongoose";
import LeadSheet, { SHEET_MAX_BYTES, SHEET_TYPES } from "../models/LeadSheet.js";
import User, { ROLES } from "../models/User.js";
import AppError from "../utils/AppError.js";

const PERSON = "firstName lastName employeeId isActive";
const isAdmin = (user) => user.role === ROLES.ADMIN;

// Check the bytes really are the file type the name claims
const looksLike = (ext, buf) => {
  if (ext === "xlsx") return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // ZIP ("PK")
  if (ext === "xls") return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  // CSV: plain text, no NUL bytes in the first chunk
  return !buf.subarray(0, 4096).includes(0);
};

// "Leads — Nov (Mumbai).xlsx" -> safe header value + UTF-8 version
const contentDisposition = (name) => {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

// POST /api/lead-sheets?assignedTo=<id>&title=&note=&fileName=   (admin)
// Body: the raw file bytes (Content-Type: application/octet-stream)
export const uploadSheet = async (req, res) => {
  const { assignedTo, note = "" } = req.query;
  const fileName = String(req.query.fileName || "").trim();
  const data = req.body;

  if (!Buffer.isBuffer(data) || data.length === 0) throw new AppError("Choose a file to upload", 400);
  if (data.length > SHEET_MAX_BYTES) throw new AppError("The file is larger than 5 MB", 413);

  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!fileName || !SHEET_TYPES[ext]) throw new AppError("Only Excel (.xlsx, .xls) or CSV files can be assigned", 400);
  if (!looksLike(ext, data)) throw new AppError(`That file doesn't look like a real .${ext} file`, 400);

  if (!mongoose.isValidObjectId(assignedTo)) {
    throw new AppError("Validation failed", 400, { assignedTo: "Choose a telecaller" });
  }
  const user = await User.findById(assignedTo);
  if (!user || user.role !== ROLES.TELECALLER) throw new AppError("Sheets can only be assigned to telecallers", 400);
  if (user.isActive === false) throw new AppError(`${user.firstName} is deactivated`, 400);

  const sheet = await LeadSheet.create({
    title: String(req.query.title || "").trim() || fileName.replace(/\.[^.]+$/, ""),
    note: String(note),
    fileName,
    extension: ext,
    size: data.length,
    data,
    assignedTo: user._id,
    uploadedBy: req.user._id,
  });
  await sheet.populate([{ path: "assignedTo", select: PERSON }, { path: "uploadedBy", select: "firstName lastName" }]);
  res.status(201).json({ message: `Sheet assigned to ${user.firstName} ${user.lastName}`, sheet });
};

// GET /api/lead-sheets?user=<id>   admins: every sheet (or one telecaller's); telecallers: their own
export const listSheets = async (req, res) => {
  const filter = {};
  if (!isAdmin(req.user)) filter.assignedTo = req.user._id;
  else if (req.query.user) {
    if (!mongoose.isValidObjectId(req.query.user)) throw new AppError("Invalid employee", 400);
    filter.assignedTo = req.query.user;
  }
  const sheets = await LeadSheet.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate([{ path: "assignedTo", select: PERSON }, { path: "uploadedBy", select: "firstName lastName" }]);
  res.json({ sheets, unread: sheets.filter((s) => !s.firstDownloadedAt).length });
};

// GET /api/lead-sheets/:id/download   (admin, or the telecaller it's assigned to)
export const downloadSheet = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError("Sheet not found", 404);
  const sheet = await LeadSheet.findById(req.params.id).select("+data");
  const mine = sheet && String(sheet.assignedTo) === String(req.user._id);
  if (!sheet || (!isAdmin(req.user) && !mine)) throw new AppError("Sheet not found", 404);

  if (mine) {
    const now = new Date();
    await LeadSheet.updateOne(
      { _id: sheet._id },
      { $inc: { downloadCount: 1 }, $set: { lastDownloadedAt: now, firstDownloadedAt: sheet.firstDownloadedAt || now } }
    );
  }
  res.setHeader("Content-Type", SHEET_TYPES[sheet.extension]);
  res.setHeader("Content-Disposition", contentDisposition(sheet.fileName));
  res.setHeader("Content-Length", sheet.data.length);
  res.end(sheet.data);
};

// DELETE /api/lead-sheets/:id   (admin)
export const deleteSheet = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError("Sheet not found", 404);
  const sheet = await LeadSheet.findByIdAndDelete(req.params.id);
  if (!sheet) throw new AppError("Sheet not found", 404);
  res.json({ message: "Sheet removed" });
};
