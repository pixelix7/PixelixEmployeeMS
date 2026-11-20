import mongoose from "mongoose";

export const WORK_CATEGORIES = {
  AUDIT_DEMO: "audit_demo",
  CREATIVE: "creative_design",
  CAMPAIGN: "campaign_post",
  FOLLOW_UP: "client_followup",
  ASSIGNED: "assigned_task",
};

export const WORK_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  WON: "closed_won",
  LOST: "closed_lost",
  CANCELLED: "cancelled",
};

// Audits/demos and client follow-ups end with an outcome (won / lost);
// everything else is simply completed.
const OUTCOME_CATEGORIES = [WORK_CATEGORIES.AUDIT_DEMO, WORK_CATEGORIES.FOLLOW_UP];

export const statusesFor = (category) => [
  WORK_STATUS.PENDING,
  WORK_STATUS.IN_PROGRESS,
  ...(OUTCOME_CATEGORIES.includes(category)
    ? [WORK_STATUS.WON, WORK_STATUS.LOST]
    : [WORK_STATUS.COMPLETED]),
  WORK_STATUS.CANCELLED,
];

// Finished: no longer on the "open" list
export const CLOSED_WORK_STATUSES = [
  WORK_STATUS.COMPLETED,
  WORK_STATUS.WON,
  WORK_STATUS.LOST,
  WORK_STATUS.CANCELLED,
];

const updateSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, default: null }, // set when the status changed
    note: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { _id: false }
);

const workItemSchema = new mongoose.Schema(
  {
    // Whose work it is
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Set when an admin assigned it
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    category: {
      type: String,
      enum: { values: Object.values(WORK_CATEGORIES), message: "Choose a valid category" },
      required: [true, "Category is required"],
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [160, "Title is too long"],
    },
    client: { type: String, trim: true, maxlength: [120, "Client name is too long"], default: "" },
    details: { type: String, trim: true, maxlength: [2000, "Details are too long"], default: "" },
    status: { type: String, default: WORK_STATUS.PENDING },
    dueDate: { type: Date, default: null },
    // Day it was logged / assigned (office timezone), e.g. "2026-11-19"
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    closedAt: { type: Date, default: null },
    // Every status change and note, oldest first
    updates: { type: [updateSchema], default: [] },
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

workItemSchema.index({ owner: 1, status: 1 });
workItemSchema.index({ owner: 1, closedAt: -1 });

// Status must fit the category (e.g. no "won" on a creative)
workItemSchema.path("status").validate(function (value) {
  return statusesFor(this.category).includes(value);
}, "That status isn't available for this category");

// Keep closedAt in step with the status
workItemSchema.pre("save", function () {
  if (!this.isModified("status")) return;
  const closed = CLOSED_WORK_STATUSES.includes(this.status);
  if (closed && !this.closedAt) this.closedAt = new Date();
  if (!closed) this.closedAt = null;
});

const WorkItem = mongoose.model("WorkItem", workItemSchema);

export default WorkItem;
