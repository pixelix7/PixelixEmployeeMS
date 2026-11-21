import { Router } from "express";
import { createHoliday, deleteHoliday, listHolidays } from "../controllers/holidayController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

router.use(protect);

// Everyone can see holidays; only admins change them
router.get("/", listHolidays);
router.post("/", authorize(ROLES.ADMIN), createHoliday);
router.delete("/:id", authorize(ROLES.ADMIN), deleteHoliday);

export default router;
