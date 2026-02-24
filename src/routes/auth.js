import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { parse, registerSchema, loginSchema } from "../utils/validators.js";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const data = parse(registerSchema, req.body);

    const exists = await prisma.user.findFirst({
      where: { OR: [{ login: data.login }, { email: data.email }] },
    });
    if (exists) return res.status(409).json({ message: "Пользователь уже существует" });

    const hashed = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        login: data.login,
        email: data.email,
        password: hashed,
        profile: { create: { city: "Самара" } },
      },
      select: { id: true, login: true, email: true, role: true },
    });

    res.status(201).json(user);
  } catch (e) {
    next(e);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const data = parse(loginSchema, req.body);

    const user = await prisma.user.findUnique({ where: { login: data.login } });
    if (!user) return res.status(401).json({ message: "Неверный логин или пароль" });

    const ok = await bcrypt.compare(data.password, user.password);
    if (!ok) return res.status(401).json({ message: "Неверный логин или пароль" });

    const token = jwt.sign(
      { sub: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
      token,
      user: { id: user.id, login: user.login, email: user.email, role: user.role },
    });
  } catch (e) {
    next(e);
  }
});

// MVP stub: you can implement real reset by sending email with a link/token.
router.post("/reset-password", async (req, res) => {
  res.json({ ok: true, message: "Если email зарегистрирован, инструкция будет отправлена." });
});

export default router;
