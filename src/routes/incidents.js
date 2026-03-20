import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { z } from "zod";

import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { parse, incidentCreateSchema } from "../utils/validators.js";
import { buildIncidentPdf, pdfToBuffer } from "../utils/pdf.js";
import { canSendEmail, sendMailWithAttachment } from "../utils/email.js";
import { uploadFileToStorage, deleteFileFromStorage } from "../utils/storage.js";

const router = Router();

// =======================================================
// VALIDATION
// =======================================================

const idSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Некорректный ID инцидента")
    .transform(Number)
    .refine((val) => val > 0, "ID должен быть положительным числом"),
});

const listIncidentsSchema = z.object({
  status: z.enum(["draft", "published"]).optional(),
  limit: z
    .string()
    .regex(/^\d*$/, "Лимит должен быть числом")
    .optional()
    .default("20")
    .transform(Number)
    .refine((val) => val >= 1 && val <= 100, "Лимит должен быть от 1 до 100"),
  offset: z
    .string()
    .regex(/^\d*$/, "Смещение должно быть числом")
    .optional()
    .default("0")
    .transform(Number)
    .refine((val) => val >= 0, "Смещение не может быть отрицательным"),
  category: z
    .string()
    .max(64, "Категория не может быть длиннее 64 символов")
    .optional(),
});

const notificationQuerySchema = z.object({
  unread: z
    .string()
    .regex(/^[01]$/, "Параметр unread должен быть 0 или 1")
    .optional()
    .default("0")
    .transform((val) => val === "1"),
});

// =======================================================
// UPLOAD CONFIG
// =======================================================

const uploadDir = process.env.UPLOAD_DIR || "uploads";
const uploadPath = path.join(process.cwd(), uploadDir);
fs.mkdirSync(uploadPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const safe = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, safe + ext);
  },
});

function fileFilter(req, file, cb) {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

  const ext = path.extname(file.originalname || "").toLowerCase();

  if (!allowedTypes.includes(file.mimetype) || !allowedExtensions.includes(ext)) {
    return cb(new Error("Допустимы только изображения: JPEG, PNG, GIF, WEBP"), false);
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
});

function removeFileIfExists(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Ошибка удаления файла ${filePath}:`, err);
  }
}

// =======================================================
// NOTIFICATIONS API
// =======================================================

router.get("/notifications", requireAuth, async (req, res, next) => {
  try {
    const { unread } = notificationQuerySchema.parse(req.query);

    const where = {
      userId: req.user.id,
      ...(unread ? { readAt: null } : {}),
    };

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
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
      }),
      prisma.notification.count({
        where: {
          userId: req.user.id,
          readAt: null,
        },
      }),
    ]);

    res.json({ items, unreadCount });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

router.post("/notifications/:id/read", requireAuth, async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const notification = await prisma.notification.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!notification || notification.userId !== req.user.id) {
      return res.status(404).json({ message: "Уведомление не найдено" });
    }

    await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

router.post("/notifications/read-all", requireAuth, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        readAt: null,
      },
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

    const recentDuplicate = await prisma.incident.findFirst({
      where: {
        userId: req.user.id,
        title: data.title,
        createdAt: {
          gt: new Date(Date.now() - 5 * 60 * 1000),
        },
      },
      select: { id: true },
    });

    if (recentDuplicate) {
      return res.status(409).json({
        message: "Вы уже создавали похожий инцидент недавно",
      });
    }

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
        createdAt: true,
      },
    });

    if (incident.status === "published") {
      const otherUsers = await prisma.user.findMany({
        where: {
          id: { not: req.user.id },
        },
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

    res.status(201).json({
      id: incident.id,
      message:
        incident.status === "published"
          ? "Инцидент опубликован"
          : "Черновик сохранен",
    });
  } catch (e) {
    next(e);
  }
});

// =======================================================
// LIST MY INCIDENTS
// =======================================================

router.get("/my", requireAuth, async (req, res, next) => {
  try {
    const { status, limit, offset } = listIncidentsSchema.parse(req.query);

    const where = {
      userId: req.user.id,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          title: true,
          address: true,
          status: true,
          category: true,
          createdAt: true,
          _count: {
            select: { photos: true },
          },
        },
      }),
      prisma.incident.count({ where }),
    ]);

    res.json({
      items,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

// =======================================================
// LIST ALL PUBLISHED
// =======================================================

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { limit, offset, category } = listIncidentsSchema.parse(req.query);

    const where = {
      status: "published",
      ...(category ? { category } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          title: true,
          address: true,
          status: true,
          category: true,
          createdAt: true,
          user: {
            select: {
              login: true,
              profile: {
                select: {
                  city: true,
                },
              },
            },
          },
          _count: {
            select: { photos: true },
          },
        },
      }),
      prisma.incident.count({ where }),
    ]);

    res.json({
      items,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

// =======================================================
// GET INCIDENT BY ID
// =======================================================

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const incident = await prisma.incident.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        title: true,
        description: true,
        address: true,
        latitude: true,
        longitude: true,
        category: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        photos: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            filename: true,
            size: true,
            mimeType: true,
            url: true,
          },
        },
        user: {
          select: {
            login: true,
            profile: {
              select: {
                name: true,
                surname: true,
              },
            },
          },
        },
      },
    });

    if (!incident) {
      return res.status(404).json({ message: "Инцидент не найден" });
    }

    const isOwner = incident.userId === req.user.id;
    const isAdmin = req.user.role === "admin";
    const isPublished = incident.status === "published";

    if (!isPublished && !isOwner && !isAdmin) {
      return res.status(403).json({ message: "Доступ запрещен" });
    }

    const photos = incident.photos.map((p) => ({
      id: p.id,
      filename: p.filename,
      url: p.url || `/uploads/${p.filename}`,
      size: p.size,
      mimeType: p.mimeType,
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
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      photos,
      author: isPublished
        ? {
            login: incident.user.login,
            name: incident.user.profile?.name,
            surname: incident.user.profile?.surname,
          }
        : undefined,
      isOwner,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

// =======================================================
// UPDATE INCIDENT
// =======================================================

router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const incident = await prisma.incident.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
      },
    });

    if (!incident) {
      return res.status(404).json({ message: "Инцидент не найден" });
    }

    const isOwner = incident.userId === req.user.id;
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Доступ запрещен" });
    }

    if (incident.status !== "draft" && !isAdmin) {
      return res.status(400).json({
        message: "Редактирование доступно только для черновиков",
      });
    }

    const updateSchema = incidentCreateSchema.partial();
    const patch = parse(updateSchema, req.body);

    delete patch.status;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        message: "Нет данных для обновления",
      });
    }

    const updated = await prisma.incident.update({
      where: { id },
      data: patch,
      select: {
        id: true,
        status: true,
        title: true,
        category: true,
      },
    });

    res.json({
      ok: true,
      incident: updated,
      message: "Инцидент обновлен",
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

// =======================================================
// PUBLISH DRAFT
// =======================================================

router.post("/:id/publish", requireAuth, async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const incident = await prisma.incident.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        title: true,
        address: true,
        description: true,
        photos: {
          select: { id: true },
        },
      },
    });

    if (!incident) {
      return res.status(404).json({ message: "Инцидент не найден" });
    }

    const isOwner = incident.userId === req.user.id;
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Доступ запрещен" });
    }

    if (incident.status === "published") {
      return res.json({
        ok: true,
        already: true,
        message: "Инцидент уже опубликован",
      });
    }

    if (!incident.description || incident.description.length < 10) {
      return res.status(400).json({
        message: "Описание должно содержать минимум 10 символов",
      });
    }

    const published = await prisma.incident.update({
      where: { id },
      data: { status: "published" },
      select: {
        id: true,
        title: true,
        address: true,
        userId: true,
        status: true,
      },
    });

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

    res.json({
      ok: true,
      published: true,
      id: published.id,
      message: "Инцидент опубликован",
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

// =======================================================
// DELETE INCIDENT
// =======================================================

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const incident = await prisma.incident.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        photos: {
          select: {
            filename: true,
            storageKey: true,
          },
        },
      },
    });

    if (!incident) {
      return res.status(404).json({ message: "Инцидент не найден" });
    }

    const isOwner = incident.userId === req.user.id;
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Доступ запрещен" });
    }

    if (incident.status !== "draft" && !isAdmin) {
      return res.status(400).json({
        message: "Удалять можно только черновики",
      });
    }

    for (const photo of incident.photos) {
      if (photo.storageKey) {
        try {
          await deleteFileFromStorage(photo.storageKey);
        } catch (err) {
          console.error(`Ошибка удаления из Object Storage ${photo.storageKey}:`, err);
        }
      } else if (photo.filename) {
        const filePath = path.join(uploadPath, photo.filename);
        removeFileIfExists(filePath);
      }
    }

    await prisma.notification.deleteMany({
      where: { incidentId: id },
    });

    await prisma.photo.deleteMany({
      where: { incidentId: id },
    });

    await prisma.incident.delete({
      where: { id },
    });

    res.json({
      ok: true,
      message: "Инцидент удален",
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

// =======================================================
// PHOTOS
// =======================================================

router.post("/:id/photos", requireAuth, (req, res, next) => {
  upload.single("photo")(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: "Файл слишком большой. Максимальный размер - 8MB",
        });
      }

      if (err.message) {
        return res.status(400).json({ message: err.message });
      }

      return next(err);
    }

    try {
      const { id } = idSchema.parse(req.params);

      const incident = await prisma.incident.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!incident) {
        if (req.file?.path) {
          removeFileIfExists(req.file.path);
        }
        return res.status(404).json({ message: "Инцидент не найден" });
      }

      if (incident.userId !== req.user.id && req.user.role !== "admin") {
        if (req.file?.path) {
          removeFileIfExists(req.file.path);
        }
        return res.status(403).json({ message: "Доступ запрещен" });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "Файл не загружен или имеет неподдерживаемый формат",
        });
      }

      const photosCount = await prisma.photo.count({
        where: { incidentId: id },
      });

      if (photosCount >= 10) {
        if (req.file?.path) {
          removeFileIfExists(req.file.path);
        }
        return res.status(400).json({
          message: "Максимальное количество фото для инцидента - 10",
        });
      }

      const objectKey = `incidents/${id}/${req.file.filename}`;

      const uploaded = await uploadFileToStorage(
        req.file.path,
        objectKey,
        req.file.mimetype
      );

      const photo = await prisma.photo.create({
        data: {
          incidentId: id,
          filename: req.file.originalname || req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          url: uploaded.url,
          storageKey: uploaded.key,
        },
        select: {
          id: true,
          filename: true,
          url: true,
        },
      });

      if (req.file?.path) {
        removeFileIfExists(req.file.path);
      }

      res.json({
        photoId: photo.id,
        url: photo.url,
        message: "Фото успешно загружено",
      });
    } catch (e) {
      if (req.file?.path) {
        removeFileIfExists(req.file.path);
      }
      next(e);
    }
  });
});

// =======================================================
// PDF / EMAIL
// =======================================================

router.get("/:id/document", requireAuth, async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const incident = await prisma.incident.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        title: true,
        category: true,
        description: true,
        latitude: true,
        longitude: true,
        address: true,
        status: true,
        createdAt: true,
      },
    });

    if (!incident) {
      return res.status(404).json({ message: "Инцидент не найден" });
    }

    if (incident.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Доступ запрещен" });
    }

    const [ownerUser, ownerProfile] = await Promise.all([
      prisma.user.findUnique({
        where: { id: incident.userId },
        select: {
          id: true,
          email: true,
        },
      }),
      prisma.profile.findUnique({
        where: { userId: incident.userId },
        select: {
          surname: true,
          name: true,
          patronymic: true,
          phone: true,
          city: true,
          street: true,
          house: true,
          flat: true,
        },
      }),
    ]);

    const doc = buildIncidentPdf({
      incident,
      user: ownerUser,
      profile: ownerProfile,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="incident_${id}_${Date.now()}.pdf"`
    );

    doc.pipe(res);
    doc.end();
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

router.post("/:id/send-email", requireAuth, async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const incident = await prisma.incident.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        title: true,
        category: true,
        description: true,
        latitude: true,
        longitude: true,
        address: true,
        status: true,
        createdAt: true,
      },
    });

    if (!incident) {
      return res.status(404).json({ message: "Инцидент не найден" });
    }

    if (incident.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Доступ запрещен" });
    }

    const [ownerUser, ownerProfile] = await Promise.all([
      prisma.user.findUnique({
        where: { id: incident.userId },
        select: {
          id: true,
          email: true,
        },
      }),
      prisma.profile.findUnique({
        where: { userId: incident.userId },
        select: {
          surname: true,
          name: true,
          patronymic: true,
          phone: true,
          city: true,
          street: true,
          house: true,
          flat: true,
        },
      }),
    ]);

    if (!ownerUser?.email) {
      return res.status(400).json({
        message: "У пользователя не указан email",
      });
    }

    if (!canSendEmail()) {
      return res.status(202).json({
        ok: true,
        queued: false,
        sent: false,
        message: "SMTP не настроен, отправка отключена (MVP).",
      });
    }

    const doc = buildIncidentPdf({
      incident,
      user: ownerUser,
      profile: ownerProfile,
    });

    const pdfBuffer = await pdfToBuffer(doc);

    await sendMailWithAttachment({
      to: ownerUser.email,
      subject: `Обращение №${id} (${incident.title})`,
      text:
        `Здравствуйте!\n\n` +
        `Во вложении сформированное обращение №${id} ` +
        `из системы «Сознательный гражданин».\n\n` +
        `Дата: ${new Date().toLocaleString("ru-RU")}`,
      filename: `incident_${id}.pdf`,
      content: pdfBuffer,
    });

    await prisma.notification.create({
      data: {
        userId: req.user.id,
        type: "email_sent",
        title: "Документ отправлен",
        body: `PDF документа №${id} отправлен на ${ownerUser.email}`,
        href: `/incident/${id}`,
        incidentId: id,
      },
    });

    res.json({
      ok: true,
      sent: true,
      message: "Документ отправлен на email",
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

export default router;