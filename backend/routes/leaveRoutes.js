import { Router } from "express";
import {
  STAFF_ONLY,
  applyLeave,
  cancelLeave,
  leaveSummary,
  listLeaves,
  myLeaves,
  reviewLeave,
} from "../controllers/leaveController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();
router.use(protect);

// Employees (admins don't clock in, so they don't take leave here)
router.post("/", authorize(...STAFF_ONLY), applyLeave);
router.get("/me", authorize(...STAFF_ONLY), myLeaves);
router.patch("/:id/cancel", authorize(...STAFF_ONLY), cancelLeave);

// Admin
router.get("/summary", authorize(ROLES.ADMIN), leaveSummary);
router.get("/", authorize(ROLES.ADMIN), listLeaves);
router.patch("/:id/review", authorize(ROLES.ADMIN), reviewLeave);

export default router;
