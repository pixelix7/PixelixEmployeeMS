import jwt from "jsonwebtoken";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";

// Requires a valid "Authorization: Bearer <token>" header.
// Attaches the logged-in user to req.user.
export const protect = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new AppError("Not authorized, no token provided", 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const message =
      err.name === "TokenExpiredError"
        ? "Session expired, please log in again"
        : "Not authorized, invalid token";
    throw new AppError(message, 401);
  }

  // Load the user fresh so deleted users or changed roles take effect immediately
  const user = await User.findById(decoded.id).select("+passwordChangedAt");
  if (!user) {
    throw new AppError("User belonging to this token no longer exists", 401);
  }

  // Deactivation takes effect immediately, even with a valid token
  if (user.isActive === false) {
    throw new AppError("Your account has been deactivated", 401);
  }

  if (user.changedPasswordAfter(decoded.iat)) {
    throw new AppError("Password was changed, please log in again", 401);
  }

  req.user = user;
  next();
};

// Restricts a route to the given roles. Use after protect.
// Example: router.get("/x", protect, authorize(ROLES.ADMIN), handler)
export const authorize =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError("You do not have permission to perform this action", 403);
    }
    next();
  };
