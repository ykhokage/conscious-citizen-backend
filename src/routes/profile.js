import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { parse, profileSchema } from "../utils/validators.js";

const router = Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
    res.json({
      id: req.user.id,
      login: req.user.login,
      email: req.user.email,
      role: req.user.role,
      ...(profile || {}),
    });
  } catch (e) {
    next(e);
  }
});

router.put("/", requireAuth, async (req, res, next) => {
  try {
    const data = parse(profileSchema, req.body);

    const updated = await prisma.profile.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, ...data },
      update: { ...data },
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export default router;
