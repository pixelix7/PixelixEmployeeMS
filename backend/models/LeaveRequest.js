import mongoose from "mongoose";

export const LEAVE_TYPES = ["casual", "sick", "earned", "unpaid", "other"];

export const LEAVE_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const leaveSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: { values: LEAVE_TYPES, message: "Choose a valid leave type" },
      required: [true, "Leave type is required"],
    },
    // Inclusive date range in the office timezone
    from: { type: String, required: [true, "Start date is required"], match: [DATE, "Pick a valid start date"] },
    to: { type: String, required: [true, "End date is required"], match: [DATE, "Pick a valid end date"] },
    // Only for single-day leave
    halfDay: { type: Boolean, default: false },
    reason: {
      type: String,
      required: [true, "Please give a reason"],
      trim: true,
      maxlength: [500, "Reason is too long"],
    },
    // Working days covered (off days and holidays don't count; half day = 0.5)
    days: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(LEAVE_STATUS), default: LEAVE_STATUS.PENDING },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, maxlength: [300, "Note is too long"], default: "" },
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

leaveSchema.index({ status: 1, from: 1 });
leaveSchema.index({ user: 1, from: 1, to: 1 });

leaveSchema.pre("validate", function () {
  if (this.from && this.to && this.to < this.from) this.invalidate("to", "End date can't be before the start date");
  if (this.halfDay && this.from !== this.to) this.invalidate("halfDay", "Half day is only for single-day leave");
});

const LeaveRequest = mongoose.model("LeaveRequest", leaveSchema);

// "2026-11-20" -> "2026-11-21"
export const nextDay = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

// Approved leave between two dates, as Map userId -> Map date -> { type, halfDay }
export const loadLeaves = async (userIds, from, to) => {
  const leaves = await LeaveRequest.find({
    user: { $in: userIds },
    status: LEAVE_STATUS.APPROVED,
    from: { $lte: to },
    to: { $gte: from },
  });
  const byUser = new Map();
  for (const l of leaves) {
    const key = String(l.user);
    if (!byUser.has(key)) byUser.set(key, new Map());
    const dates = byUser.get(key);
    for (let d = l.from < from ? from : l.from; d <= l.to && d <= to; d = nextDay(d)) {
      dates.set(d, { type: l.type, halfDay: l.halfDay });
    }
  }
  return byUser;
};

export default LeaveRequest;
