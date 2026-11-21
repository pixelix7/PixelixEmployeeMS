import { Router } from "express";
import { createTasks, deleteTask, listTasks, taskSummary, updateTask } from "../controllers/taskController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

router.use(protect);

// Everyone sees their tasks (admins see all); only admins assign or delete
router.get("/", listTasks);
router.get("/summary", taskSummary);
router.patch("/:id", updateTask);
router.post("/", authorize(ROLES.ADMIN), createTasks);
router.delete("/:id", authorize(ROLES.ADMIN), deleteTask);

export default router;
