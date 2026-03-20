import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Схемы валидации
const idSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Некорректный ID уведомления")
    .transform(Number)
    .refine(val => val > 0, "ID должен быть положительным числом"),
});

const notificationQuerySchema = z.object({
  unread: z
    .string()
    .regex(/^[01]$/, "Параметр unread должен быть 0 или 1")
    .optional()
    .default("0")
    .transform(val => val === "1"),
  limit: z
    .string()
    .regex(/^\d*$/, "Лимит должен быть числом")
    .transform(Number)
    .optional()
    .default("50")
    .refine(val => val >= 1 && val <= 200, "Лимит должен быть от 1 до 200"),
  offset: z
    .string()
    .regex(/^\d*$/, "Смещение должно быть числом")
    .transform(Number)
    .optional()
    .default("0")
    .refine(val => val >= 0, "Смещение не может быть отрицательным"),
});

// GET /api/notifications
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { unread, limit, offset } = notificationQuerySchema.parse(req.query);

    const where = {
      userId: req.user.id,
      ...(unread ? { readAt: null } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
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
      prisma.notification.count({ where })
    ]);

    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, readAt: null },
    });

    res.json({ 
      items, 
      unreadCount,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + items.length < total
      }
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Ошибка валидации параметров",
        errors: e.errors.map(err => err.message)
      });
    }
    next(e);
  }
});

// POST /api/notifications/:id/read
router.post("/:id/read", requireAuth, async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const notification = await prisma.notification.findUnique({ 
      where: { id } 
    });
    
    if (!notification) {
      return res.status(404).json({ message: "Уведомление не найдено" });
    }

    if (notification.userId !== req.user.id) {
      return res.status(403).json({ message: "Доступ запрещен" });
    }

    if (notification.readAt) {
      return res.json({ 
        ok: true, 
        already: true,
        message: "Уведомление уже прочитано" 
      });
    }

    await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    res.json({ 
      ok: true,
      message: "Уведомление отмечено как прочитанное"
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

// POST /api/notifications/read-all
router.post("/read-all", requireAuth, async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { 
        userId: req.user.id, 
        readAt: null 
      },
      data: { readAt: new Date() },
    });

    res.json({ 
      ok: true,
      count: result.count,
      message: result.count > 0 
        ? `Отмечено ${result.count} уведомлений как прочитанные`
        : "Непрочитанных уведомлений нет"
    });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/notifications/:id (опционально - удаление уведомления)
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = idSchema.parse(req.params);

    const notification = await prisma.notification.findUnique({ 
      where: { id } 
    });
    
    if (!notification) {
      return res.status(404).json({ message: "Уведомление не найдено" });
    }

    if (notification.userId !== req.user.id) {
      return res.status(403).json({ message: "Доступ запрещен" });
    }

    await prisma.notification.delete({
      where: { id }
    });

    res.json({ 
      ok: true,
      message: "Уведомление удалено"
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: e.errors[0].message });
    }
    next(e);
  }
});

export default router;