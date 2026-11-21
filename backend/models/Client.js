import mongoose from "mongoose";
import { normalizePhone } from "../utils/phone.js";

export const CLIENT_STATUS = ["active", "on_hold", "inactive"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const emptyToNull = (v) => (v === "" || v === undefined ? null : v);
const phoneSetter = (v) => (v === "" || v == null ? null : normalizePhone(v));
// "example.com" -> "https://example.com"
const websiteSetter = (v) => {
  if (v === "" || v == null) return null;
  const s = String(v).trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

const PHONE = [/^\d{6,15}$/, "Enter a valid phone number"];

const historySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const clientSchema = new mongoose.Schema(
  {
    /* ----- Basic ----- */
    name: {
      type: String,
      required: [true, "Client / business name is required"],
      trim: true,
      maxlength: [120, "Name is too long"],
    },
    contactPerson: { type: String, trim: true, maxlength: [80, "Contact person is too long"], default: "" },
    phone: { type: String, required: [true, "Phone number is required"], set: phoneSetter, match: PHONE },
    altPhone: { type: String, default: null, set: phoneSetter, match: PHONE },
    email: {
      type: String,
      default: null,
      set: emptyToNull,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Enter a valid email address"],
    },
    website: {
      type: String,
      default: null,
      set: websiteSetter,
      maxlength: [200, "Website is too long"],
      match: [/^https?:\/\/[^\s.]+\.[^\s]+$/i, "Enter a valid website, e.g. example.com"],
    },

    /* ----- Business ----- */
    industry: { type: String, trim: true, maxlength: [60, "Industry is too long"], default: "" },
    address: { type: String, trim: true, maxlength: [300, "Address is too long"], default: "" },
    city: { type: String, trim: true, maxlength: [60, "City is too long"], default: "" },
    gstNumber: {
      type: String,
      default: null,
      set: emptyToNull,
      uppercase: true,
      trim: true,
      match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN"],
    },

    /* ----- Contract ----- */
    joinedOn: { type: String, required: [true, "Date of joining is required"], match: [DATE, "Pick a valid date"] },
    contractNumber: { type: String, default: null, set: emptyToNull, trim: true, maxlength: [50, "Contract number is too long"] },
    contractStart: { type: String, default: null, set: emptyToNull, match: [DATE, "Pick a valid start date"] },
    contractEnd: { type: String, default: null, set: emptyToNull, match: [DATE, "Pick a valid end date"] },
    contractValue: { type: Number, default: null, min: [0, "Contract value can't be negative"] },
    services: { type: String, trim: true, maxlength: [300, "Services list is too long"], default: "" },

    status: {
      type: String,
      enum: { values: CLIENT_STATUS, message: "Status must be active, on hold or inactive" },
      default: "active",
    },
    notes: { type: String, trim: true, maxlength: [2000, "Notes are too long"], default: "" },

    /* ----- Management ----- */
    // Employees who handle this client
    assignedTo: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [], index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
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

// Contract numbers are optional but must be unique when given
clientSchema.index(
  { contractNumber: 1 },
  { unique: true, partialFilterExpression: { contractNumber: { $type: "string" } } }
);
clientSchema.index({ name: 1 });

clientSchema.pre("validate", function () {
  if (this.contractStart && this.contractEnd && this.contractEnd < this.contractStart) {
    this.invalidate("contractEnd", "Contract end must be after the start");
  }
  if (this.assignedTo?.length) {
    this.assignedTo = [...new Map(this.assignedTo.map((id) => [String(id?._id || id), id])).values()];
  }
});

const Client = mongoose.model("Client", clientSchema);

export default Client;
