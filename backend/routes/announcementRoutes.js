import { Router } from "express";
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  markRead,
  updateAnnouncement,
} from "../controllers/announcementController.js";
import { authorize, protect } from "../middleware/auth.js";
import { ROLES } from "../models/User.js";

const router = Router();

router.use(protect);

// Everyone reads; employees mark as seen; only admins post or change
router.get("/", listAnnouncements);
router.post("/read", authorize(ROLES.TELECALLER, ROLES.DIGITAL_MARKETING), markRead);
router.post("/", authorize(ROLES.ADMIN), createAnnouncement);
router.patch("/:id", authorize(ROLES.ADMIN), updateAnnouncement);
router.delete("/:id", authorize(ROLES.ADMIN), deleteAnnouncement);

export default router;
