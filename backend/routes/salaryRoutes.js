import { Router } from "express";
import {
  createSalary,
  deleteSalary,
  employeeHistory,
  generateMonth,
  listSalaries,
  markPaid,
  updateSalary,
} from "../controllers/salaryController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

// Salary data is admin-only
router.use(protect, authorize(ROLES.ADMIN));

router.get("/", listSalaries);
router.get("/user/:id", employeeHistory);
router.post("/", createSalary);
router.post("/generate", generateMonth);
router.patch("/:id", updateSalary);
router.patch("/:id/pay", markPaid);
router.delete("/:id", deleteSalary);

export default router;
