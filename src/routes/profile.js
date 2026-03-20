import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { z } from "zod";

import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadFileToStorage, deleteFileFromStorage } from "../utils/storage.js";

const router = Router();

const profileSchema = z.object({
  surname: z.string().max(100).optional().nullable(),
  name: z.string().max(100).optional().nullable(),
  patronymic: z.string().max(100).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  street: z.string().max(100).optional().nullable(),
  house: z.string().max(30).optional().nullable(),
  flat: z.string().max(30).optional().nullable(),
});

const uploadDir = process.env.UPLOAD_DIR || "uploads";
const avatarTempDir = path.join(process.cwd(), uploadDir, "avatars");
fs.mkdirSync(avatarTempDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarTempDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeName = `avatar-${req.user.id}-${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

function fileFilter(req, file, cb) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (!allowedTypes.includes(file.mimetype) || !allowedExtensions.includes(ext)) {
    return cb(new Error("Допустимы только изображения JPG, PNG, WEBP"), false);
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
});

function removeFileIfExists(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("Ошибка удаления файла:", err);
  }
}

// GET /api/profile
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user.id },
      select: {
        surname: true,
        name: true,
        patronymic: true,
        phone: true,
        city: true,
        street: true,
        house: true,
        flat: true,
        avatarUrl: true,
        avatarStorageKey: true,
      },
    });

    res.json(
      profile || {
        surname: "",
        name: "",
        patronymic: "",
        phone: "",
        city: "",
        street: "",
        house: "",
        flat: "",
        avatarUrl: "",
        avatarStorageKey: "",
      }
    );
  } catch (e) {
    next(e);
  }
});

// PUT /api/profile
router.put("/", requireAuth, async (req, res, next) => {
  try {
    const data = profileSchema.parse(req.body);

    const profile = await prisma.profile.upsert({
      where: { userId: req.user.id },
      update: data,
      create: {
        userId: req.user.id,
        ...data,
      },
      select: {
        surname: true,
        name: true,
        patronymic: true,
        phone: true,
        city: true,
        street: true,
        house: true,
        flat: true,
        avatarUrl: true,
        avatarStorageKey: true,
      },
    });

    res.json(profile);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

// POST /api/profile/avatar
router.post("/avatar", requireAuth, (req, res, next) => {
  upload.single("avatar")(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: "Файл слишком большой. Максимум 2 МБ",
        });
      }

      if (err.message) {
        return res.status(400).json({ message: err.message });
      }

      return next(err);
    }

    try {
      if (!req.file) {
        return res.status(400).json({ message: "Файл не загружен" });
      }

      const existing = await prisma.profile.findUnique({
        where: { userId: req.user.id },
        select: {
          avatarUrl: true,
          avatarStorageKey: true,
        },
      });

      if (existing?.avatarStorageKey) {
        try {
          await deleteFileFromStorage(existing.avatarStorageKey);
        } catch (deleteError) {
          console.error("Ошибка удаления старого аватара из Object Storage:", deleteError);
        }
      }

      const objectKey = `avatars/${req.user.id}/${req.file.filename}`;

      const uploaded = await uploadFileToStorage(
        req.file.path,
        objectKey,
        req.file.mimetype
      );

      const avatarUrl = uploaded.url;
      const avatarStorageKey = uploaded.key;

      const profile = await prisma.profile.upsert({
        where: { userId: req.user.id },
        update: {
          avatarUrl,
          avatarStorageKey,
        },
        create: {
          userId: req.user.id,
          avatarUrl,
          avatarStorageKey,
        },
        select: {
          avatarUrl: true,
          avatarStorageKey: true,
        },
      });

      if (req.file?.path) {
        removeFileIfExists(req.file.path);
      }

      res.json({
        ok: true,
        avatarUrl: profile.avatarUrl,
        avatarStorageKey: profile.avatarStorageKey,
        message: "Аватар загружен",
      });
    } catch (e) {
      if (req.file?.path) {
        removeFileIfExists(req.file.path);
      }
      next(e);
    }
  });
});

// DELETE /api/profile/avatar
router.delete("/avatar", requireAuth, async (req, res, next) => {
  try {
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user.id },
      select: {
        avatarUrl: true,
        avatarStorageKey: true,
      },
    });

    if (profile?.avatarStorageKey) {
      try {
        await deleteFileFromStorage(profile.avatarStorageKey);
      } catch (deleteError) {
        console.error("Ошибка удаления аватара из Object Storage:", deleteError);
      }
    }

    await prisma.profile.upsert({
      where: { userId: req.user.id },
      update: {
        avatarUrl: null,
        avatarStorageKey: null,
      },
      create: {
        userId: req.user.id,
        avatarUrl: null,
        avatarStorageKey: null,
      },
    });

    res.json({
      ok: true,
      message: "Аватар удалён",
    });
  } catch (e) {
    next(e);
  }
});

export default router;