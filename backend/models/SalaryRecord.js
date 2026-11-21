import mongoose from "mongoose";

export const PAYMENT_MODES = ["bank_transfer", "upi", "cash", "cheque"];
export const SALARY_STATUS = ["pending", "paid"];

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 100000000; // ₹10 crore — catches typos
const emptyToNull = (v) => (v === "" || v === undefined ? null : v);
const rupees = (v) => (v === "" || v == null ? 0 : Math.round(Number(v)));

// One incentive or deduction line, e.g. { title: "5 conversions × ₹500", amount: 2500 }
const lineSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, "Describe each line"], trim: true, maxlength: [120, "Description is too long"] },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      set: rupees,
      min: [0, "Amount can't be negative"],
      max: [MAX_AMOUNT, "Amount looks too large"],
    },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false }
);

const sum = (lines) => (lines || []).reduce((n, l) => n + (Number(l.amount) || 0), 0);

const salarySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: [true, "Choose an employee"], index: true },
    // Pay month, e.g. "2026-11"
    month: { type: String, required: [true, "Month is required"], match: [MONTH, "Pick a valid month"] },

    baseSalary: {
      type: Number,
      required: [true, "Base salary is required"],
      set: rupees,
      min: [0, "Base salary can't be negative"],
      max: [MAX_AMOUNT, "Base salary looks too large"],
    },
    incentives: { type: [lineSchema], default: [] },
    deductions: { type: [lineSchema], default: [] },

    // Kept in step by the pre-validate hook
    incentiveTotal: { type: Number, default: 0 },
    deductionTotal: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 },

    status: {
      type: String,
      enum: { values: SALARY_STATUS, message: "Status must be pending or paid" },
      default: "pending",
    },
    paidOn: { type: String, default: null, set: emptyToNull, match: [DATE, "Pick a valid payment date"] },
    paymentMode: {
      type: String,
      default: null,
      set: emptyToNull,
      enum: { values: [...PAYMENT_MODES, null], message: "Choose a valid payment mode" },
    },
    reference: { type: String, trim: true, maxlength: [80, "Reference is too long"], default: "" },
    notes: { type: String, trim: true, maxlength: [1000, "Notes are too long"], default: "" },

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

// One record per employee per month
salarySchema.index({ user: 1, month: 1 }, { unique: true });
salarySchema.index({ month: 1 });

salarySchema.pre("validate", function () {
  this.incentiveTotal = sum(this.incentives);
  this.deductionTotal = sum(this.deductions);
  this.netPay = (Number(this.baseSalary) || 0) + this.incentiveTotal - this.deductionTotal;
  if (this.netPay < 0) this.invalidate("deductions", "Deductions can't be more than the salary plus incentives");

  if (this.status === "paid") {
    if (!this.paidOn) this.invalidate("paidOn", "Payment date is required");
    if (!this.paymentMode) this.invalidate("paymentMode", "Choose how it was paid");
  } else {
    this.paidOn = null;
    this.paymentMode = null;
  }
});

const SalaryRecord = mongoose.model("SalaryRecord", salarySchema);

export default SalaryRecord;
