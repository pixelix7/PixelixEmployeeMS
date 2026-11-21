import { Router } from "express";
import {
  approveMany,
  editReport,
  listReports,
  myReports,
  reportSummary,
  reviewReport,
  submitReport,
} from "../controllers/workReportController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();
const STAFF = [ROLES.TELECALLER, ROLES.DIGITAL_MARKETING];

router.use(protect);

router.get("/summary", reportSummary);

// Employees file their own end-of-day reports
router.get("/me", authorize(...STAFF), myReports);
router.post("/", authorize(...STAFF), submitReport);
router.patch("/:id", authorize(...STAFF), editReport);

// Admins review them
router.get("/", authorize(ROLES.ADMIN), listReports);
router.post("/approve-all", authorize(ROLES.ADMIN), approveMany);
router.patch("/:id/review", authorize(ROLES.ADMIN), reviewReport);

export default router;
