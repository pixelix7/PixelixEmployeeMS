import Holiday from "../models/Holiday.js";
import AppError from "../utils/AppError.js";
import { DATE_RE } from "../utils/time.js";

// GET /api/holidays?from=2026-01-01&to=2026-12-31   (any logged-in user)
export const listHolidays = async (req, res) => {
  const filter = {};
  for (const [key, op] of [["from", "$gte"], ["to", "$lte"]]) {
    if (req.query[key]) {
      if (!DATE_RE.test(req.query[key])) throw new AppError(`${key} must look like YYYY-MM-DD`, 400);
      filter.date = { ...filter.date, [op]: req.query[key] };
    }
  }
  const holidays = await Holiday.find(filter).sort({ date: 1 }).limit(200);
  res.json({ holidays });
};

// POST /api/holidays  { date, name }   (admin)
export const createHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.create({ date: req.body?.date, name: req.body?.name });
    res.status(201).json({ message: "Holiday added", holiday });
  } catch (err) {
    if (err.code === 11000) throw new AppError("There's already a holiday on that date", 409);
    throw err;
  }
};

// DELETE /api/holidays/:id   (admin)
export const deleteHoliday = async (req, res) => {
  const holiday = await Holiday.findByIdAndDelete(req.params.id);
  if (!holiday) throw new AppError("Holiday not found", 404);
  res.json({ message: "Holiday removed" });
};
