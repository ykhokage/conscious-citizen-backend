import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";

import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { parse, incidentCreateSchema } from "../utils/validators.js";
import { buildIncidentPdf } from "../utils/pdf.js";
import { canSendEmail, sendMailWithAttachment } from "../utils/email.js";

const router = Router();
const uploadDir = process.env.UPLOAD_DIR || "uploads";
const uploadPath = path.join(process.cwd(), uploadDir);
fs.mkdirSync(uploadPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const safe = Date.now() + "-" + Math.random().toString(16).slice(2);
    const ext = path.extname(file.originalname || "");
    cb(null, safe + ext);
  },
});

function fileFilter(req, file, cb) {
  if (!file.mimetype?.startsWith("image/")) return cb(null, false);
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const data = parse(incidentCreateSchema, req.body);
    const incident = await prisma.incident.create({
      data: {
        userId: req.user.id,
        category: data.category,
        title: data.title,
        description: data.description,
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        status: data.status || "published",
      },
    });
    res.status(201).json({ id: incident.id });
  } catch (e) {
    next(e);
  }
});

router.get("/my", requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.incident.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, address: true, status: true, category: true, createdAt: true },
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.incident.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, address: true, status: true, category: true, createdAt: true },
      take: 200,
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad id" });

    const incident = await prisma.incident.findUnique({
      where: { id },
      include: { photos: true },
    });
    if (!incident) return res.status(404).json({ message: "Not found" });

    // access: owner or admin
    if (incident.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const photos = incident.photos.map((p) => ({
      id: p.id,
      url: `/uploads/${p.filename}`,
    }));

    res.json({
      id: incident.id,
      title: incident.title,
      description: incident.description,
      address: incident.address,
      latitude: incident.latitude,
      longitude: incident.longitude,
      category: incident.category,
      status: incident.status,
      photos,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/photos", requireAuth, upload.single("photo"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad id" });

    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) return res.status(404).json({ message: "Not found" });
    if (incident.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!req.file) return res.status(400).json({ message: "Invalid image" });

    const photo = await prisma.photo.create({
      data: {
        incidentId: id,
        filename: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });

    res.json({ photoId: photo.id });
  } catch (e) {
    next(e);
  }
});

router.get("/:id/document", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) return res.status(404).json({ message: "Not found" });
    if (incident.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await prisma.user.findUnique({ where: { id: incident.userId } });
    const profile = await prisma.profile.findUnique({ where: { userId: incident.userId } });

    const doc = buildIncidentPdf({ incident, user, profile });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="incident_${id}.pdf"`);

    doc.pipe(res);
    doc.end();
  } catch (e) {
    next(e);
  }
});

router.post("/:id/send-email", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) return res.status(404).json({ message: "Not found" });
    if (incident.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await prisma.user.findUnique({ where: { id: incident.userId } });
    const profile = await prisma.profile.findUnique({ where: { userId: incident.userId } });

    // Build PDF into buffer
    const doc = buildIncidentPdf({ incident, user, profile });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const bufferPromise = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
    doc.end();
    const pdfBuffer = await bufferPromise;

    if (!canSendEmail()) {
      return res.status(202).json({ ok: true, queued: false, message: "SMTP не настроен, отправка отключена (MVP)." });
    }

    await sendMailWithAttachment({
      to: user.email,
      subject: `Обращение №${id} (${incident.title})`,
      text: "Во вложении сформированное обращение из системы «Сознательный гражданин».",
      filename: `incident_${id}.pdf`,
      content: pdfBuffer,
    });

    res.json({ ok: true, sent: true });
  } catch (e) {
    next(e);
  }
});

export default router;
