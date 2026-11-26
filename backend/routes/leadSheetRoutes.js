import express, { Router } from "express";
import { deleteSheet, downloadSheet, listSheets, uploadSheet } from "../controllers/leadSheetController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";
import { SHEET_MAX_BYTES } from "../models/LeadSheet.js";

const router = Router();

router.use(protect);

// Admins assign sheets to telecallers; telecallers download the ones assigned to them
router.get("/", authorize(ROLES.ADMIN, ROLES.TELECALLER), listSheets);
router.get("/:id/download", authorize(ROLES.ADMIN, ROLES.TELECALLER), downloadSheet);
router.post(
  "/",
  authorize(ROLES.ADMIN),
  // The file is sent as raw bytes (+1 KB so the 5 MB check gives a friendly message)
  express.raw({ type: "application/octet-stream", limit: SHEET_MAX_BYTES + 1024 }),
  uploadSheet
);
router.delete("/:id", authorize(ROLES.ADMIN), deleteSheet);

export default router;
