import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// =======================================================
// СХЕМЫ
// =======================================================

const adminIncidentsQuerySchema = z.object({
  q: z.string().max(200).optional().default(""),
  category: z.string().max(64).optional().default(""),
  status: z.enum(["draft", "published", "archived"]).optional(),

  // 🔥 уменьшили лимит
  limit: z
    .string()
    .regex(/^\d*$/)
    .transform(Number)
    .optional()
    .default("20")
    .refine((val) => val >= 1 && val <= 100),

  offset: z
    .string()
    .regex(/^\d*$/)
    .transform(Number)
    .optional()
    .default("0")
    .refine((val) => val >= 0),

  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

const adminUsersQuerySchema = z.object({
  q: z.string().max(200).optional().default(""),
  role: z.enum(["user", "admin"]).optional(),
  verified: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),

  // 🔥 уменьшили лимит
  limit: z
    .string()
    .regex(/^\d*$/)
    .transform(Number)
    .optional()
    .default("20")
    .refine((val) => val >= 1 && val <= 100),

  offset: z
    .string()
    .regex(/^\d*$/)
    .transform(Number)
    .optional()
    .default("0")
    .refine((val) => val >= 0),
});

// =======================================================
// АДМИН: СПИСОК ИНЦИДЕНТОВ
// =======================================================

router.get("/incidents", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { q, category, status, limit, offset, fromDate, toDate } =
      adminIncidentsQuerySchema.parse(req.query);

    const where = {};

    if (category) where.category = category;
    if (status) where.status = status;

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate + "T23:59:59");
    }

    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

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
              id: true,
              login: true,
              email: true,
            },
          },

          // 🔥 убрали notifications
          _count: {
            select: {
              photos: true,
            },
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
      return res.status(400).json({
        message: "Ошибка валидации параметров",
        errors: e.errors.map((err) => err.message),
      });
    }
    next(e);
  }
});

// =======================================================
// 🔥 НОВЫЙ ENDPOINT — КАТЕГОРИИ (разгрузка)
// =======================================================

router.get("/incident-categories", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const categories = await prisma.incident.groupBy({
      by: ["category"],
      _count: { category: true },
      orderBy: { _count: { category: "desc" } },
      take: 20,
    });

    res.json({
      items: categories.map((c) => ({
        name: c.category,
        count: c._count.category,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// =======================================================
// АДМИН: СТАТИСТИКА
// =======================================================

router.get("/stats", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const [byCategory, byStatus, totalUsers, recentActivity, totalIncidents] =
      await Promise.all([
        prisma.incident.groupBy({
          by: ["category"],
          _count: { category: true },
        }),
        prisma.incident.groupBy({
          by: ["status"],
          _count: { status: true },
        }),
        prisma.user.count(),
        prisma.incident.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
        prisma.incident.count(),
      ]);

    res.json({
      overview: {
        totalIncidents,
        totalUsers,
        recentActivity,
      },
      byCategory,
      byStatus,
    });
  } catch (e) {
    next(e);
  }
});

// =======================================================
// АДМИН: ПОЛЬЗОВАТЕЛИ
// =======================================================

router.get("/users", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { q, role, verified, limit, offset } =
      adminUsersQuerySchema.parse(req.query);

    const where = {};

    if (role) where.role = role;
    if (verified !== undefined) where.emailVerified = verified;

    if (q) {
      where.OR = [
        { login: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          login: true,
          email: true,
          role: true,
          emailVerified: true,
          createdAt: true,
          profile: {
            select: {
              name: true,
              surname: true,
              phone: true,
              city: true,
            },
          },
          _count: {
            select: {
              incidents: true,
              notifications: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      items: users,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + users.length < total,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({
        message: "Ошибка валидации параметров",
        errors: e.errors.map((err) => err.message),
      });
    }
    next(e);
  }
});

// =======================================================
// АДМИН: СТАТУС ИНЦИДЕНТА
// =======================================================

router.patch("/incidents/:id/status", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = z.object({
      id: z.number().positive(),
    }).parse({ id: Number(req.params.id) });

    const { status } = z.object({
      status: z.enum(["draft", "published", "archived"]),
    }).parse(req.body);

    const incident = await prisma.incident.findUnique({
      where: { id },
    });

    if (!incident) {
      return res.status(404).json({ message: "Инцидент не найден" });
    }

    const updated = await prisma.incident.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        title: true,
        status: true,
        userId: true,
      },
    });

    if (incident.userId !== req.user.id) {
      await prisma.notification.create({
        data: {
          userId: incident.userId,
          type: "incident_status_changed",
          title: "Статус изменен",
          href: `/incident/${incident.id}`,
          incidentId: incident.id,
        },
      });
    }

    res.json({ ok: true, incident: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ message: "Ошибка валидации" });
    }
    next(e);
  }
});

export default router;