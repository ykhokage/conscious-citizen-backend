import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/incidents", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();

    const where = {};
    if (category) where.category = category;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
      ];
    }

    const items = await prisma.incident.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, address: true, status: true, category: true, createdAt: true },
      take: 500,
    });

    res.json({ items });
  } catch (e) {
    next(e);
  }
});

router.get("/stats", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const byCategory = await prisma.incident.groupBy({
      by: ["category"],
      _count: { category: true },
    });

    const byStatus = await prisma.incident.groupBy({
      by: ["status"],
      _count: { status: true },
    });

    res.json({
      byCategory: byCategory.map((x) => ({ category: x.category, count: x._count.category })),
      byStatus: byStatus.map((x) => ({ status: x.status, count: x._count.status })),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
