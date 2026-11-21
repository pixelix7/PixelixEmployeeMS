import mongoose from "mongoose";

// Office holidays. A holiday is never counted as an absence.
const holidaySchema = new mongoose.Schema(
  {
    // Calendar day in the office timezone, e.g. "2026-11-08"
    date: {
      type: String,
      required: [true, "Date is required"],
      unique: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must look like YYYY-MM-DD"],
    },
    name: {
      type: String,
      required: [true, "Holiday name is required"],
      trim: true,
      maxlength: [80, "Name is too long"],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

const Holiday = mongoose.model("Holiday", holidaySchema);

// Holidays between two date keys (inclusive) as a Map: "2026-11-08" -> "Diwali"
export const loadHolidays = async (from, to) =>
  new Map(
    (await Holiday.find({ date: { $gte: from, $lte: to } }).sort({ date: 1 })).map((h) => [h.date, h.name])
  );

export default Holiday;
