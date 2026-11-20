import { Router } from "express";
import {
  register,
  login,
  getMe,
  updateMe,
  changePassword,
} from "../controllers/authController.js";
import { protect, authorize } from "../middleware/auth.js";
import User, { ROLES } from "../models/User.js";

const router = Router();

// Lets the very first user register without a token (bootstraps the first admin).
// Once any user exists, registration requires an admin token.
const firstUserOrAdmin = async (req, res, next) => {
  const count = await User.estimatedDocumentCount();
  if (count === 0) {
    req.isFirstUser = true;
    return next();
  }
  await protect(req, res, () => authorize(ROLES.ADMIN)(req, res, next));
};

router.post("/register", firstUserOrAdmin, register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.patch("/me", protect, updateMe);
router.patch("/change-password", protect, changePassword);

export default router;
