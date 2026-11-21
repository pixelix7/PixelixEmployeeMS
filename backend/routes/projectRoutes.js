import { Router } from "express";
import {
  addUpdate,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "../controllers/projectController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

router.use(protect);

// Employees see projects they're on and post progress; admins manage everything
router.get("/", listProjects);
router.get("/:id", getProject);
router.post("/:id/updates", addUpdate);
router.post("/", authorize(ROLES.ADMIN), createProject);
router.patch("/:id", authorize(ROLES.ADMIN), updateProject);
router.delete("/:id", authorize(ROLES.ADMIN), deleteProject);

export default router;
