import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const ROLES = {
  ADMIN: "admin",
  TELECALLER: "telecaller",
  DIGITAL_MARKETING: "digital_marketing",
};

const SALT_ROUNDS = 12;

// Treat "" as "not provided" so optional fields stay null
const emptyToNull = (v) => (v === "" || v === undefined ? null : v);

const userSchema = new mongoose.Schema(
  {
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
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.passwordChangedAt;
        delete ret.__v;
        return ret;
      },
    },
  }
);

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
