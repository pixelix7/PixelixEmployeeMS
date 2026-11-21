import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import runMigrations from "./utils/migrations.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import leadRoutes from "./routes/leadRoutes.js";
import workRoutes from "./routes/workRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import holidayRoutes from "./routes/holidayRoutes.js";
import leaveRoutes from "./routes/leaveRoutes.js";
import announcementRoutes from "./routes/announcementRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import clientRoutes from "./routes/clientRoutes.js";
import salaryRoutes from "./routes/salaryRoutes.js";
import workReportRoutes from "./routes/workReportRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ message: "EMS API is running" });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/work", workRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/salaries", salaryRoutes);
app.use("/api/work-reports", workReportRoutes);
app.use("/api/projects", projectRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
});

// Error handler
app.use((err, req, res, next) => {
  // Mongoose validation errors -> 400 with a message per field
  if (err.name === "ValidationError") {
    const errors = Object.fromEntries(
      Object.entries(err.errors).map(([field, e]) => [field, e.message])
    );
    return res.status(400).json({ message: "Validation failed", errors });
  }

  // Duplicate unique field (email, pan, aadhar) -> 409
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({ message: `A user with this ${field} already exists` });
  }

  // Invalid ObjectId in a URL param -> 400
  if (err.name === "CastError") {
    return res.status(400).json({ message: `Invalid ${err.path}` });
  }

  // Malformed JSON body -> 400
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON in request body" });
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    message: status >= 500 ? "Server error" : err.message,
    ...(status < 500 && err.errors && { errors: err.errors }),
  });
});

connectDB()
  .then(runMigrations)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
