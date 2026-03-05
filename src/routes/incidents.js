import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";

import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { parse, incidentCreateSchema } from "../utils/validators.js";
import { buildIncidentPdf, pdfToBuffer } from "../utils/pdf.js";
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

// =======================================================
// ✅ NOTIFICATIONS API (ВАЖНО: ДО /:id !!!)
// База URL: /api/incidents/notifications...
// =======================================================

// GET /api/incidents/notifications?unread=1
router.get("/notifications", requireAuth, async (req, res, next) => {
  try {
    const unreadOnly = String(req.query.unread || "") === "1";

    const where = {
      userId: req.user.id,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const items = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        incidentId: true,
        readAt: true,
        createdAt: true,
      },
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, readAt: null },
    });

    res.json({ items, unreadCount });
  } catch (e) {
    next(e);
  }
});

// POST /api/incidents/notifications/:id/read
router.post("/notifications/:id/read", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad id" });

    const n = await prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== req.user.id) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/incidents/notifications/read-all
router.post("/notifications/read-all", requireAuth, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// =======================================================
// CREATE INCIDENT
// =======================================================
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
      select: {
        id: true,
        title: true,
        category: true,
        address: true,
        userId: true,
        status: true,
      },
    });

    // ✅ уведомления создаём ТОЛЬКО если published
    if (incident.status === "published") {
      const otherUsers = await prisma.user.findMany({
        where: { id: { not: req.user.id } },
        select: { id: true },
      });

      if (otherUsers.length) {
        await prisma.notification.createMany({
          data: otherUsers.map((u) => ({
            userId: u.id,
            type: "incident_created",
            title: "Новый инцидент",
            body: `${incident.title} — ${incident.address}`,
            href: `/incident/${incident.id}`,
            incidentId: incident.id,
          })),
        });
      }
    }

    res.status(201).json({ id: incident.id });
  } catch (e) {
    next(e);
  }
});

// =======================================================
// LIST MY INCIDENTS (published/draft)
// GET /api/incidents/my?status=draft|published
// =======================================================
router.get("/my", requireAuth, async (req, res, next) => {
  try {
    const status = String(req.query.status || ""); // optional
    const where = {
      userId: req.user.id,
      ...(status ? { status } : {}),
    };

    const items = await prisma.incident.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        address: true,
        status: true,
        category: true,
        createdAt: true,
      },
    });

    res.json({ items });
  } catch (e) {
    next(e);
  }
});

// =======================================================
// LIST ALL PUBLISHED (для всех)
// =======================================================
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.incident.findMany({
      where: { status: "published" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        address: true,
        status: true,
        category: true,
        createdAt: true,
      },
      take: 200,
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

// =======================================================
// GET INCIDENT BY ID
// published — доступно всем авторизованным
// draft — только автор или admin
// =======================================================
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad id" });

    const incident = await prisma.incident.findUnique({
      where: { id },
      include: { photos: true },
    });
    if (!incident) return res.status(404).json({ message: "Not found" });

    const isOwner = incident.userId === req.user.id;
    const isAdmin = req.user.role === "admin";
    const isPublished = incident.status === "published";

    if (!isPublished && !isOwner && !isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const photos = incident.photos.map((p) => ({
      id: p.id,
      filename: p.filename,
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

// =======================================================
// UPDATE INCIDENT (редактирование черновика)
// PATCH /api/incidents/:id
// =======================================================
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad id" });

    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) return res.status(404).json({ message: "Not found" });

    const isOwner = incident.userId === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });

    // редактировать можно ТОЛЬКО draft (так логичнее)
    if (incident.status !== "draft" && !isAdmin) {
      return res.status(400).json({ message: "Редактирование доступно только для черновиков" });
    }

    // безопасно вытаскиваем поля
    const patch = {
      category: req.body.category,
      title: req.body.title,
      description: req.body.description,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      address: req.body.address,
    };

    // удалим undefined, чтобы не затирать
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

    const updated = await prisma.incident.update({
      where: { id },
      data: patch,
      select: { id: true, status: true },
    });

    res.json({ ok: true, incident: updated });
  } catch (e) {
    next(e);
  }
});

// =======================================================
// PUBLISH DRAFT
// POST /api/incidents/:id/publish
// =======================================================
router.post("/:id/publish", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad id" });

    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) return res.status(404).json({ message: "Not found" });

    const isOwner = incident.userId === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });

    if (incident.status === "published") {
      return res.json({ ok: true, already: true });
    }

    const published = await prisma.incident.update({
      where: { id },
      data: { status: "published" },
      select: { id: true, title: true, address: true, userId: true, status: true },
    });

    // ✅ создаём уведомления всем кроме автора
    const otherUsers = await prisma.user.findMany({
      where: { id: { not: published.userId } },
      select: { id: true },
    });

    if (otherUsers.length) {
      await prisma.notification.createMany({
        data: otherUsers.map((u) => ({
          userId: u.id,
          type: "incident_created",
          title: "Новый инцидент",
          body: `${published.title} — ${published.address}`,
          href: `/incident/${published.id}`,
          incidentId: published.id,
        })),
      });
    }

    res.json({ ok: true, published: true, id: published.id });
  } catch (e) {
    next(e);
  }
});

// =======================================================
// DELETE INCIDENT (обычно черновик)
// DELETE /api/incidents/:id
// =======================================================
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad id" });

    const incident = await prisma.incident.findUnique({
      where: { id },
      include: { photos: true },
    });
    if (!incident) return res.status(404).json({ message: "Not found" });

    const isOwner = incident.userId === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });

    if (incident.status !== "draft" && !isAdmin) {
      return res.status(400).json({ message: "Удалять можно только черновики" });
    }

    // удаляем файлы фото (опционально, но правильно)
    for (const p of incident.photos) {
      const fp = path.join(uploadPath, p.filename);
      try {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch {}
    }

    await prisma.incident.delete({ where: { id } });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// =======================================================
// PHOTOS
// =======================================================
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

// =======================================================
// PDF / EMAIL
// =======================================================
router.get("/:id/document", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad id" });

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
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad id" });

    const incident = await prisma.incident.findUnique({ where: { id } });
    if (!incident) return res.status(404).json({ message: "Not found" });

    if (incident.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await prisma.user.findUnique({ where: { id: incident.userId } });
    const profile = await prisma.profile.findUnique({ where: { userId: incident.userId } });

    if (!user?.email) {
      return res.status(400).json({ message: "У пользователя не указан email" });
    }

    if (!canSendEmail()) {
      return res.status(202).json({
        ok: true,
        queued: false,
        sent: false,
        message: "SMTP не настроен, отправка отключена (MVP).",
      });
    }

    const doc = buildIncidentPdf({ incident, user, profile });
    const pdfBuffer = await pdfToBuffer(doc);

    await sendMailWithAttachment({
      to: user.email,
      subject: `Обращение №${id} (${incident.title})`,
      text: `Здравствуйте!\n\nВо вложении сформированное обращение №${id} из системы «Сознательный гражданин».`,
      filename: `incident_${id}.pdf`,
      content: pdfBuffer,
    });

    res.json({ ok: true, sent: true });
  } catch (e) {
    next(e);
  }
});

export default router;