import { Router } from "express";
import {
  clockIn,
  clockOut,
  exportMonthly,
  getDaily,
  getMonthly,
  getMyAttendance,
  getMyCalendar,
  getSettings,
  getToday,
  getUserMonth,
} from "../controllers/attendanceController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

// Any logged-in user can track their own attendance
router.use(protect);

router.get("/settings", getSettings);
router.get("/today", getToday);
router.get("/me", getMyAttendance);
router.get("/me/calendar", getMyCalendar);
router.post("/clock-in", clockIn);
router.post("/clock-out", clockOut);

// Admin reports
router.get("/daily", authorize(ROLES.ADMIN), getDaily);
router.get("/monthly", authorize(ROLES.ADMIN), getMonthly);
router.get("/monthly/export", authorize(ROLES.ADMIN), exportMonthly);
router.get("/user/:id", authorize(ROLES.ADMIN), getUserMonth);

export default router;
