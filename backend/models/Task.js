import mongoose from "mongoose";
import { TIME_RE, startOfDay } from "../utils/time.js";

export const TASK_STATUS = {
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  DONE: "done",
  CANCELLED: "cancelled",
};
export const OPEN_TASK_STATUSES = [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS];
export const TASK_PRIORITIES = ["low", "medium", "high"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NO_DEADLINE = new Date("9999-12-31T00:00:00Z"); // sorts tasks without a deadline last
const emptyToNull = (v) => (v === "" || v === undefined ? null : v);

const updateSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, default: null }, // set when the status changed
    note: { type: String, trim: true, maxlength: [1000, "Note is too long"], default: "" },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      maxlength: [150, "Title can be at most 150 characters"],
    },
    description: { type: String, trim: true, maxlength: [2000, "Description is too long"], default: "" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: [true, "Choose an employee"], index: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    priority: {
      type: String,
      enum: { values: TASK_PRIORITIES, message: "Priority must be low, medium or high" },
      default: "medium",
    },
    status: {
      type: String,
      enum: { values: Object.values(TASK_STATUS), message: "Choose a valid status" },
      default: TASK_STATUS.TODO,
    },
    // Optional deadline: a day, optionally with a time (office timezone)
    dueDate: { type: String, default: null, set: emptyToNull, match: [DATE, "Pick a valid deadline date"] },
    dueTime: { type: String, default: null, set: emptyToNull, match: [TIME_RE, "Pick a valid deadline time"] },
    // The exact deadline moment (end of day when no time is given); used for sorting and "overdue"
    dueAt: { type: Date, default: NO_DEADLINE },
    completedAt: { type: Date, default: null },
    // Every status change and note, oldest first
    updates: { type: [updateSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        if (!ret.dueDate) ret.dueAt = null;
        ret.overdue = Boolean(
          ret.dueAt && OPEN_TASK_STATUSES.includes(ret.status) && new Date(ret.dueAt) < new Date()
        );
        return ret;
      },
    },
  }
);

taskSchema.index({ assignedTo: 1, status: 1, dueAt: 1 });
taskSchema.index({ status: 1, dueAt: 1 });

taskSchema.pre("validate", function () {
  if (!this.dueDate) this.dueTime = null;
  if (this.dueDate && DATE.test(this.dueDate) && (!this.dueTime || TIME_RE.test(this.dueTime))) {
    const [h, m] = (this.dueTime || "23:59").split(":").map(Number);
    this.dueAt = new Date(startOfDay(this.dueDate).getTime() + (h * 60 + m) * 60000 + (this.dueTime ? 0 : 59999));
  } else if (!this.dueDate) {
    this.dueAt = NO_DEADLINE;
  }
  // Keep completedAt in step with the status
  if (this.isModified("status")) {
    if (this.status === TASK_STATUS.DONE && !this.completedAt) this.completedAt = new Date();
    if (this.status !== TASK_STATUS.DONE) this.completedAt = null;
  }
});

const Task = mongoose.model("Task", taskSchema);

export default Task;
