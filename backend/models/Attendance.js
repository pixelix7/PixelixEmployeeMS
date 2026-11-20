import mongoose from "mongoose";

export const ATTENDANCE_STATUS = {
  PRESENT: "present",
  LATE: "late",
};

const attendanceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Calendar day in the office timezone, e.g. "2026-11-19"
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    // First clock-in of the day (decides on time / late)
    checkIn: {
      type: Date,
      required: true,
    },
    // Last clock-out of the day; null while a session is running
    checkOut: {
      type: Date,
      default: null,
    },
    // Each clock-in / clock-out pair. Staff can clock out and back in
    // during the day; the time of every session adds up.
    sessions: {
      type: [
        {
          _id: false,
          in: { type: Date, required: true },
          out: { type: Date, default: null },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        delete ret.id;
        return ret;
      },
    },
  }
);

// One record per user per day
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

// Sessions for this day. Records saved before sessions existed
// are read as a single session from checkIn to checkOut.
attendanceSchema.methods.allSessions = function () {
  if (this.sessions?.length) return this.sessions;
  return [{ in: this.checkIn, out: this.checkOut }];
};

// Minutes from finished sessions (a running session is not counted yet)
attendanceSchema.virtual("workMinutes").get(function () {
  const ms = this.allSessions()
    .filter((s) => s.out)
    .reduce((sum, s) => sum + (s.out - s.in), 0);
  return Math.round(ms / 60000);
});

// When the running session started, or null if clocked out.
// Clients add (now - activeSince) to workMinutes for a live total.
attendanceSchema.virtual("activeSince").get(function () {
  if (this.checkOut) return null;
  const open = this.allSessions().find((s) => !s.out);
  return open ? open.in : null;
});

attendanceSchema.virtual("sessionCount").get(function () {
  return this.allSessions().length;
});

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
