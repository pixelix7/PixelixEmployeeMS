import { Router } from "express";
import {
  createWorkItem,
  deleteWorkItem,
  getBoard,
  listWork,
  updateWorkItem,
} from "../controllers/workController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

// Digital marketing team, plus admins (who can view everything and assign tasks)
router.use(protect, authorize(ROLES.DIGITAL_MARKETING, ROLES.ADMIN));

router.get("/board", getBoard);
router.get("/", listWork);
router.post("/", createWorkItem);
router.patch("/:id", updateWorkItem);
router.delete("/:id", deleteWorkItem);

export default router;
