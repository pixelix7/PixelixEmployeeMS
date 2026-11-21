import mongoose from "mongoose";

export const PROJECT_STATUS = ["planning", "in_progress", "on_hold", "completed", "cancelled"];
export const ACTIVE_PROJECT_STATUS = ["planning", "in_progress"];
export const PROJECT_PRIORITIES = ["low", "medium", "high"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const emptyToNull = (v) => (v === "" || v === undefined ? null : v);

const updateSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, trim: true, maxlength: [1000, "Update is too long"], default: "" },
    progress: { type: Number, default: null }, // set when progress changed
    status: { type: String, default: null }, // set when status changed
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Project name is required"],
      trim: true,
      maxlength: [120, "Name is too long"],
    },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: [true, "Choose a client"], index: true },
    description: { type: String, trim: true, maxlength: [3000, "Description is too long"], default: "" },
    status: {
      type: String,
      enum: { values: PROJECT_STATUS, message: "Choose a valid status" },
      default: "planning",
    },
    priority: {
      type: String,
      enum: { values: PROJECT_PRIORITIES, message: "Priority must be low, medium or high" },
      default: "medium",
    },
    startDate: { type: String, default: null, set: emptyToNull, match: [DATE, "Pick a valid start date"] },
    dueDate: { type: String, default: null, set: emptyToNull, match: [DATE, "Pick a valid deadline"] },
    progress: {
      type: Number,
      default: 0,
      min: [0, "Progress can't be below 0%"],
      max: [100, "Progress can't be above 100%"],
      set: (v) => (v === "" || v == null ? 0 : Math.round(Number(v))),
    },
    completedAt: { type: Date, default: null },

    // Employees working on it
    team: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [], index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
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

projectSchema.index({ status: 1, dueDate: 1 });

projectSchema.pre("validate", function () {
  if (this.startDate && this.dueDate && this.dueDate < this.startDate) {
    this.invalidate("dueDate", "Deadline must be after the start date");
  }
  if (this.team?.length) this.team = [...new Map(this.team.map((id) => [String(id?._id || id), id])).values()];
  if (this.isModified("status")) {
    if (this.status === "completed") {
      this.completedAt = this.completedAt || new Date();
      this.progress = 100;
    } else {
      this.completedAt = null;
    }
  }
});

const Project = mongoose.model("Project", projectSchema);

export default Project;
