import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import geoRoutes from "./routes/geo.js";
import incidentRoutes from "./routes/incidents.js";
import adminRoutes from "./routes/admin.js";
import { errorHandler, notFound } from "./middleware/errors.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(helmet());
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

// Uploads static
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = process.env.UPLOAD_DIR || "uploads";
const uploadPath = path.join(__dirname, "..", uploadDir);
fs.mkdirSync(uploadPath, { recursive: true });
app.use("/uploads", express.static(uploadPath));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/geo", geoRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
