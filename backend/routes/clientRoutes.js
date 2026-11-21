import { Router } from "express";
import {
  bulkAssign,
  createClient,
  deleteClient,
  getClient,
  listClients,
  updateClient,
} from "../controllers/clientController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

router.use(protect);

// Employees can view the clients assigned to them; only admins manage clients
router.get("/", listClients);
router.post("/assign", authorize(ROLES.ADMIN), bulkAssign);
router.get("/:id", getClient);
router.post("/", authorize(ROLES.ADMIN), createClient);
router.patch("/:id", authorize(ROLES.ADMIN), updateClient);
router.delete("/:id", authorize(ROLES.ADMIN), deleteClient);

export default router;
