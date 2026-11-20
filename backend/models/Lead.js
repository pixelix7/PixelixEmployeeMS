import mongoose from "mongoose";
import { normalizePhone } from "../utils/phone.js";

export const LEAD_SOURCES = ["instagram", "facebook", "amazon", "flipkart", "other"];

export const CALL_STATUS = {
  NEW: "new", // added, not called yet
  NO_ANSWER: "no_answer",
  BUSY: "busy",
  CALL_BACK: "call_back",
  INTERESTED: "interested",
  NOT_INTERESTED: "not_interested",
  CONVERTED: "converted",
  INVALID: "invalid", // wrong / switched-off number
};

// Leads in these statuses are done: no more follow-ups
export const CLOSED_STATUSES = [
  CALL_STATUS.NOT_INTERESTED,
  CALL_STATUS.CONVERTED,
  CALL_STATUS.INVALID,
];

const leadSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: [true, "Business / brand name is required"],
      trim: true,
      maxlength: [120, "Business name is too long"],
    },
    // Unique: one number can only be in the system once
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      set: normalizePhone,
      match: [/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"],
    },
    source: {
      type: String,
      enum: { values: LEAD_SOURCES, message: "Choose a valid source" },
      required: [true, "Source is required"],
    },
    callStatus: {
      type: String,
      enum: { values: Object.values(CALL_STATUS), message: "Choose a valid call status" },
      default: CALL_STATUS.NEW,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, "Notes are too long"],
      default: "",
    },
    // Next call. Null = no follow-up planned.
    followUpAt: {
      type: Date,
      default: null,
    },
    // The telecaller who added it. The lead is locked to them.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    lastContactedAt: {
      type: Date,
      default: null,
    },
    // Every add / call update, oldest first (used by the daily report)
    activity: {
      type: [
        {
          _id: false,
          kind: { type: String, enum: ["added", "update"], required: true },
          at: { type: Date, default: Date.now },
          by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          status: { type: String },
          statusChanged: { type: Boolean, default: false },
          note: { type: String, default: "" },
          followUpAt: { type: Date, default: null },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.activity; // only the daily report reads it, straight from the documents
        return ret;
      },
    },
  }
);

// Fast "my follow-ups due by X" lookups
leadSchema.index({ owner: 1, followUpAt: 1 });
// Daily report: "what happened on this day"
leadSchema.index({ "activity.at": 1 });

const Lead = mongoose.model("Lead", leadSchema);

export default Lead;
