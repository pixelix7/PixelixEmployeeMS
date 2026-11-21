import { Router } from "express";
import {
  exportDailyReport,
  exportMonthlyReport,
  getDailyReport,
  getMonthlyReport,
} from "../controllers/reportController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

router.use(protect, authorize(ROLES.ADMIN));

// ?user=<id> narrows any of these to one employee; exports take ?format=xlsx|pdf
router.get("/daily", getDailyReport);
router.get("/daily/export", exportDailyReport);
router.get("/monthly", getMonthlyReport);
router.get("/monthly/export", exportMonthlyReport);

export default router;
