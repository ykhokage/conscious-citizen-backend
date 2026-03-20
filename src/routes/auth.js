import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { 
  parse, 
  registerSchema, 
  loginSchema,
  resetPasswordSchema,
  resetPasswordConfirmSchema,
  verifyEmailSchema 
} from "../utils/validators.js";
import { canSendEmail, sendMail } from "../utils/email.js";
import { generate6DigitCode, hashCode } from "../utils/otp.js";
import {
  buildVerifyEmailText,
  buildResetPasswordText,
} from "../utils/emailTemplates.js";

const router = Router();

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

// ============================
// REGISTER (с подтверждением email кодом)
// ============================
router.post("/register", async (req, res, next) => {
  try {
    const data = parse(registerSchema, req.body);

    const exists = await prisma.user.findFirst({
      where: { 
        OR: [
          { login: data.login }, 
          { email: data.email.toLowerCase() }
        ] 
      },
    });
    
    if (exists) {
      const field = exists.login === data.login ? "логин" : "email";
      return res.status(409).json({ 
        message: `Пользователь с таким ${field} уже существует` 
      });
    }

    const hashed = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        login: data.login,
        email: data.email.toLowerCase(),
        password: hashed,
        emailVerified: false,
        profile: { create: { city: "Самара" } },
      },
      select: { 
        id: true, 
        login: true, 
        email: true, 
        role: true, 
        emailVerified: true 
      },
    });

    const code = generate6DigitCode();
    const exp = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { 
        emailCodeHash: hashCode(code), 
        emailCodeExp: exp 
      },
    });

    let emailSent = false;
    let emailError = null;

    if (canSendEmail()) {
      try {
        await sendMail({
          to: user.email,
          subject: "Подтверждение почты (код из 6 цифр)",
          text: buildVerifyEmailText(code),
        });
        emailSent = true;
      } catch (e) {
        emailError = e?.message || String(e);
      }
    }

    const token = signToken(user);

    res.status(201).json({
      user,
      token,
      emailSent,
      message: emailSent
        ? "Код отправлен на почту. Введите 6 цифр для подтверждения."
        : "Код не отправлен (ошибка SMTP или ограничения почты). Проверьте настройки/спам.",
      debug: emailError ? { emailError } : undefined,
    });
  } catch (e) {
    next(e);
  }
});

// ============================
// LOGIN (нельзя пока email не подтвержден)
// ============================
router.post("/login", async (req, res, next) => {
  try {
    const data = parse(loginSchema, req.body);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { login: data.login }, 
          { email: data.login.toLowerCase() }
        ],
      },
    });
    
    if (!user) {
      return res.status(401).json({ message: "Неверный логин или пароль" });
    }

    const ok = await bcrypt.compare(data.password, user.password);
    if (!ok) {
      return res.status(401).json({ message: "Неверный логин или пароль" });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        message: "Email не подтверждён. Проверьте почту и введите код.",
      });
    }

    const token = signToken(user);

    res.json({
      token,
      user: { 
        id: user.id, 
        login: user.login, 
        email: user.email, 
        role: user.role 
      },
    });
  } catch (e) {
    next(e);
  }
});

// ============================
// VERIFY EMAIL (код 6 цифр)
// ============================
router.post("/verify-email", async (req, res, next) => {
  try {
    const data = parse(verifyEmailSchema, req.body);
    const { email, code } = data;

    const user = await prisma.user.findUnique({ 
      where: { email } 
    });
    
    if (!user) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    if (user.emailVerified) {
      return res.json({ 
        ok: true, 
        verified: true, 
        already: true,
        message: "Email уже подтверждён"
      });
    }

    if (!user.emailCodeHash || !user.emailCodeExp) {
      return res.status(400).json({ 
        message: "Код не запрошен. Нажмите 'Отправить код повторно'." 
      });
    }

    if (new Date() > user.emailCodeExp) {
      return res.status(400).json({ 
        message: "Код истёк. Нажмите 'Отправить код повторно'." 
      });
    }

    if (hashCode(code) !== user.emailCodeHash) {
      return res.status(400).json({ message: "Неверный код" });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { 
        emailVerified: true, 
        emailCodeHash: null, 
        emailCodeExp: null 
      },
      select: { 
        id: true, 
        login: true, 
        email: true, 
        role: true, 
        emailVerified: true 
      },
    });

    res.json({ 
      ok: true, 
      verified: true, 
      user: updated, 
      message: "Email подтверждён. Теперь можно войти." 
    });
  } catch (e) {
    next(e);
  }
});

// ============================
// RESEND CODE
// ============================
router.post("/resend-code", async (req, res, next) => {
  try {
    const data = parse(resetPasswordSchema, req.body);
    const { email } = data;

    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    if (user.emailVerified) {
      return res.json({ 
        ok: true, 
        already: true, 
        message: "Email уже подтверждён" 
      });
    }

    const code = generate6DigitCode();
    const exp = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { 
        emailCodeHash: hashCode(code), 
        emailCodeExp: exp 
      },
    });

    if (!canSendEmail()) {
      return res.status(202).json({ 
        ok: true, 
        sent: false, 
        message: "Почта не настроена" 
      });
    }

    await sendMail({
      to: email,
      subject: "Новый код подтверждения",
      text: buildVerifyEmailText(code),
    });

    return res.json({ 
      ok: true, 
      sent: true, 
      message: "Новый код отправлен на почту" 
    });
  } catch (e) {
    next(e);
  }
});

// ============================
// RESET PASSWORD STEP 1: запрос кода
// ============================
router.post("/reset-password", async (req, res, next) => {
  try {
    const data = parse(resetPasswordSchema, req.body);
    const { email } = data;

    const user = await prisma.user.findUnique({ where: { email } });
    
    // Всегда возвращаем одинаковый ответ для безопасности
    if (!user) {
      return res.json({
        ok: true,
        message: "Инструкция отправлена на почту (если email зарегистрирован).",
      });
    }

    const code = generate6DigitCode();
    const exp = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { 
        resetCodeHash: hashCode(code), 
        resetCodeExp: exp 
      },
    });

    let emailSent = false;
    let emailError = null;

    if (canSendEmail()) {
      try {
        await sendMail({
          to: user.email,
          subject: "Сброс пароля (код из 6 цифр)",
          text: buildResetPasswordText(code),
        });
        emailSent = true;
      } catch (e) {
        emailError = e?.message || String(e);
      }
    }

    return res.json({
      ok: true,
      emailSent,
      message: emailSent
        ? "Код отправлен на почту. Введите 6 цифр."
        : "Инструкция отправлена на почту (если email зарегистрирован).",
      debug: emailError ? { emailError } : undefined,
    });
  } catch (e) {
    next(e);
  }
});

// ============================
// RESET PASSWORD STEP 2: подтверждение кода + новый пароль
// ============================
router.post("/reset-password/confirm", async (req, res, next) => {
  try {
    const data = parse(resetPasswordConfirmSchema, req.body);
    const { email, code, newPassword } = data;

    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      return res.status(400).json({ message: "Неверный код или email" });
    }

    if (!user.resetCodeHash || !user.resetCodeExp) {
      return res.status(400).json({ 
        message: "Код не запрошен. Нажмите 'Сбросить пароль' ещё раз." 
      });
    }

    if (new Date() > user.resetCodeExp) {
      return res.status(400).json({ 
        message: "Код истёк. Запросите новый код." 
      });
    }

    if (hashCode(code) !== user.resetCodeHash) {
      return res.status(400).json({ message: "Неверный код" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetCodeHash: null,
        resetCodeExp: null,
      },
    });

    res.json({ 
      ok: true, 
      message: "Пароль изменён. Теперь можно войти." 
    });
  } catch (e) {
    next(e);
  }
});

export default router;