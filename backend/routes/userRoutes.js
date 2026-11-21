import { Router } from "express";
import {
  listUsers,
  getUser,
  getUserStats,
  bulkCreateUsers,
  getEmployeeProfile,
  updateUser,
  resetUserPassword,
  deleteUser,
} from "../controllers/userController.js";
import { protect, authorize } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

// Every route here is admin-only
router.use(protect, authorize(ROLES.ADMIN));

router.get("/", listUsers);
router.get("/stats", getUserStats); // must come before "/:id"
router.post("/bulk", bulkCreateUsers);
router.get("/:id/profile", getEmployeeProfile);
router.get("/:id", getUser);
router.patch("/:id", updateUser);
router.patch("/:id/password", resetUserPassword);
router.delete("/:id", deleteUser);

export default router;
