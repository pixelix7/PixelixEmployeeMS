import { Router } from "express";
import {
  checkPhone,
  createLead,
  listLeads,
  todaysFollowUps,
  updateLead,
} from "../controllers/leadController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

// The CRM is for telecallers; admins can see and manage everything
router.use(protect, authorize(ROLES.TELECALLER, ROLES.ADMIN));

router.get("/check", checkPhone);
router.get("/follow-ups/today", todaysFollowUps);
router.get("/", listLeads);
router.post("/", createLead);
router.patch("/:id", updateLead);

export default router;
