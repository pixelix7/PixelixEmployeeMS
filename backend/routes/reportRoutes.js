import { Router } from "express";
import { exportDailyReport, getDailyReport } from "../controllers/reportController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

router.use(protect, authorize(ROLES.ADMIN));

router.get("/daily", getDailyReport);
router.get("/daily/export", exportDailyReport);

export default router;
