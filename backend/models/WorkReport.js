import mongoose from "mongoose";

export const REPORT_STATUS = ["pending", "approved", "rejected"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const historySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    action: { type: String, enum: ["submitted", "resubmitted", "edited", "approved", "rejected"] },
    note: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { _id: false }
);

// An employee's end-of-day report: what they worked on that day
const workReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // The day the report is about (office timezone)
    date: { type: String, required: [true, "Date is required"], match: [DATE, "Pick a valid date"] },
    summary: {
      type: String,
      required: [true, "Tell us what you worked on"],
      trim: true,
      minlength: [10, "Add a little more detail (at least 10 characters)"],
      maxlength: [3000, "Keep it under 3000 characters"],
    },
    blockers: { type: String, trim: true, maxlength: [1000, "Keep blockers under 1000 characters"], default: "" },
    tomorrow: { type: String, trim: true, maxlength: [1000, "Keep the plan under 1000 characters"], default: "" },

    status: { type: String, enum: REPORT_STATUS, default: "pending" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, maxlength: [500, "Note is too long"], default: "" },
    submittedAt: { type: Date, default: Date.now },

    history: { type: [historySchema], default: [] },
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

// One report per employee per day
workReportSchema.index({ user: 1, date: 1 }, { unique: true });
workReportSchema.index({ status: 1, date: -1 });

const WorkReport = mongoose.model("WorkReport", workReportSchema);

export default WorkReport;
