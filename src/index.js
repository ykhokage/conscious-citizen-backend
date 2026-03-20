import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import notificationRoutes from "./routes/notifications.js";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import geoRoutes from "./routes/geo.js";
import incidentRoutes from "./routes/incidents.js";
import adminRoutes from "./routes/admin.js";

import { errorHandler, notFound } from "./middleware/errors.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

// =======================================================
// CORS
// =======================================================

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;

const ALLOWED_ORIGINS = [
  FRONTEND_ORIGIN,
  "http://localhost:5173",
  "http://localhost:5174",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// =======================================================
// SECURITY
// =======================================================

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

// =======================================================
// MIDDLEWARE
// =======================================================

// увеличили лимит
app.use(express.json({ limit: "5mb" }));

// логирование только в dev
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// =======================================================
// STATIC FILES (UPLOADS)
// =======================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = process.env.UPLOAD_DIR || "uploads";
const uploadPath = path.join(__dirname, "..", uploadDir);

// создаём папку только если нет
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  },
  express.static(uploadPath)
);

// =======================================================
// ROUTES
// =======================================================

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/geo", geoRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);

// =======================================================
// ERRORS
// =======================================================

app.use(notFound);
app.use(errorHandler);

// =======================================================
// START
// =======================================================

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});