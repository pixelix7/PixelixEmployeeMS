import mongoose from "mongoose";

export const SHEET_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// File types an admin can assign, by extension
export const SHEET_TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};

// An Excel / CSV file the admin assigns to one telecaller, kept exactly as uploaded.
// Stored in MongoDB because the server's own disk is wiped on every deploy/restart.
const leadSheetSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, "Give the sheet a title"], trim: true, maxlength: [120, "Title is too long"] },
    note: { type: String, trim: true, maxlength: [500, "Note is too long"], default: "" },
    fileName: { type: String, required: true, trim: true, maxlength: 200 },
    extension: { type: String, enum: Object.keys(SHEET_TYPES), required: true },
    size: { type: Number, required: true },
    // The file itself; only loaded when someone downloads it
    data: { type: Buffer, required: true, select: false },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Downloads by the telecaller it's assigned to (admin downloads aren't counted)
    downloadCount: { type: Number, default: 0 },
    firstDownloadedAt: { type: Date, default: null },
    lastDownloadedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.data;
        return ret;
      },
    },
  }
);

leadSheetSchema.index({ assignedTo: 1, createdAt: -1 });

const LeadSheet = mongoose.model("LeadSheet", leadSheetSchema);

export default LeadSheet;
