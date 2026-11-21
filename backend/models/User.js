import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { TIME_RE, dateKey, scheduleFor } from "../utils/time.js";
import Counter, { nextSequence } from "./Counter.js";

export const ROLES = {
  ADMIN: "admin",
  TELECALLER: "telecaller",
  DIGITAL_MARKETING: "digital_marketing",
};

const SALT_ROUNDS = 12;

// Treat "" as "not provided" so optional fields stay null
const emptyToNull = (v) => (v === "" || v === undefined ? null : v);

// Employee IDs: "P" + 2-digit joining year + number in that year, e.g. P26001
export const EMPLOYEE_ID_RE = /^P(\d{2})(\d{3,})$/;
export const employeeIdFor = (yy, n) => `P${yy}${String(n).padStart(3, "0")}`;
export const nextEmployeeId = async (date = new Date()) => {
  const yy = dateKey(date).slice(2, 4); // office timezone
  const n = await nextSequence(`employee-${yy}`);
  return { id: employeeIdFor(yy, n), yy, n };
};

const userSchema = new mongoose.Schema(
  {
    // Set automatically when the user is created; never changes
    employeeId: {
      type: String,
      default: undefined,
      immutable: true,
      trim: true,
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: 50,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      match: [/^[6-9]\d{9}$/, "Enter a valid 10-digit phone number"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Enter a valid email address"],
    },
    pan: {
      type: String,
      default: null,
      set: emptyToNull,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Enter a valid PAN (e.g. ABCDE1234F)"],
    },
    aadhar: {
      type: String,
      default: null,
      set: emptyToNull,
      trim: true,
      match: [/^\d{12}$/, "Aadhar must be 12 digits"],
    },
    role: {
      type: String,
      enum: {
        values: Object.values(ROLES),
        message: "Role must be admin, telecaller or digital_marketing",
      },
      default: ROLES.TELECALLER,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // never returned in queries unless explicitly requested
    },
    passwordChangedAt: {
      type: Date,
      select: false,
    },

    /* ----- Work schedule. Empty = use the company schedule from .env ----- */
    officeStart: {
      type: String,
      default: null,
      match: [TIME_RE, "Office start must be a time like 09:30"],
    },
    officeEnd: {
      type: String,
      default: null,
      match: [TIME_RE, "Office end must be a time like 18:30"],
    },
    // Minutes after office start before a clock-in counts as late
    graceMinutes: {
      type: Number,
      default: null,
      min: [0, "Grace can't be negative"],
      max: [240, "Grace can be at most 240 minutes"],
    },
    // Working days, 0 = Sunday ... 6 = Saturday. Empty = company default.
    workDays: {
      type: [Number],
      default: [],
      validate: {
        validator: (days) => days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        message: "Working days must be numbers from 0 (Sunday) to 6 (Saturday)",
      },
    },

    /* ----- Account status ----- */
    // Deactivated employees can't log in and drop out of reports from deactivatedAt
    isActive: {
      type: Boolean,
      default: true,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.passwordChangedAt;
        delete ret.__v;
        // The schedule that actually applies (own settings + company defaults)
        ret.schedule = scheduleFor(ret);
        return ret;
      },
    },
  }
);

// Office end must be after office start (when both are set)
userSchema.pre("validate", function () {
  if (this.officeStart && this.officeEnd && this.officeEnd <= this.officeStart) {
    this.invalidate("officeEnd", "Office end must be after office start");
  }
  if (this.workDays?.length) this.workDays = [...new Set(this.workDays)].sort();
  // Keep deactivatedAt in step with isActive
  if (this.isModified("isActive")) this.deactivatedAt = this.isActive ? null : new Date();
});

// PAN and Aadhar are optional, but must be unique when provided.
// Partial index skips documents where the field is null.
userSchema.index(
  { pan: 1 },
  { unique: true, partialFilterExpression: { pan: { $type: "string" } } }
);
userSchema.index(
  { aadhar: 1 },
  { unique: true, partialFilterExpression: { aadhar: { $type: "string" } } }
);

// Unique when set (older users get one from the startup backfill)
userSchema.index(
  { employeeId: 1 },
  { unique: true, partialFilterExpression: { employeeId: { $type: "string" } } }
);

// New users get the next employee ID for this year
userSchema.pre("save", async function () {
  if (!this.isNew || this.employeeId) return;
  const { id, yy, n } = await nextEmployeeId();
  this.employeeId = id;
  this.$locals.employeeSeq = { yy, n };
});

// If the insert failed (e.g. duplicate email), hand the number back so IDs have no gaps —
// but only if nobody has taken a later number in the meantime.
// Error handler: Mongoose awaits it and then passes the original error on (don't call next).
userSchema.post("save", { errorHandler: true }, async function (_err) {
  const seq = this.$locals?.employeeSeq;
  if (seq && this.isNew) {
    await Counter.updateOne({ _id: `employee-${seq.yy}`, seq: seq.n }, { $inc: { seq: -1 } }).catch(() => {});
    this.employeeId = undefined;
    this.$locals.employeeSeq = undefined;
  }
});

// Hash the password whenever it is set or changed
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  this.password = await bcrypt.hash(this.password, salt);

  // Record when the password changed so older tokens can be rejected.
  // Set 1s in the past because JWT "iat" is rounded down to whole seconds.
  if (!this.isNew) {
    this.passwordChangedAt = new Date(Date.now() - 1000);
  }
});

// Compare a plain-text password with the stored hash
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// True if the password was changed after the token was issued
userSchema.methods.changedPasswordAfter = function (tokenIssuedAt) {
  if (!this.passwordChangedAt) return false;
  return tokenIssuedAt * 1000 < this.passwordChangedAt.getTime();
};

// Create a signed JWT for this user
userSchema.methods.generateToken = function () {
  return jwt.sign({ id: this._id, role: this.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
};

const User = mongoose.model("User", userSchema);

export default User;
