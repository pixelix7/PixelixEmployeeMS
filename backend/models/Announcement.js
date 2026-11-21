import mongoose from "mongoose";

export const ANNOUNCEMENT_AUDIENCES = ["all", "telecaller", "digital_marketing"];
export const ANNOUNCEMENT_PRIORITIES = ["normal", "important"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [120, "Title can be at most 120 characters"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      maxlength: [2000, "Message can be at most 2000 characters"],
    },
    // Who sees it: everyone, or only one team
    audience: {
      type: String,
      enum: { values: ANNOUNCEMENT_AUDIENCES, message: "Choose who should see this" },
      default: "all",
    },
    priority: {
      type: String,
      enum: { values: ANNOUNCEMENT_PRIORITIES, message: "Priority must be normal or important" },
      default: "normal",
    },
    // Pinned ones stay at the top
    pinned: { type: Boolean, default: false },
    // Last day it's shown to employees ("YYYY-MM-DD", office timezone). null = no end.
    expiresOn: {
      type: String,
      default: null,
      set: (v) => (v === "" ? null : v),
      match: [DATE, "Pick a valid date"],
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Employees who have seen it
    readBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [], select: false },
  },
  { timestamps: true }
);

announcementSchema.index({ pinned: -1, createdAt: -1 });

const Announcement = mongoose.model("Announcement", announcementSchema);

export default Announcement;
