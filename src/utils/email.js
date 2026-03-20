import nodemailer from "nodemailer";

let transporter = null;

function buildTransportOptions() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true") === "true";

  return {
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },

    // ✅ важно для Windows/IPv6-историй: принудительно IPv4
    family: 4,

    // ✅ таймауты (по умолчанию иногда слишком "мягкие" / непонятные)
    connectionTimeout: 25000,
    greetingTimeout: 25000,
    socketTimeout: 25000,

    // ✅ TLS настройки: для mail.ru обычно ок, но можно оставить мягче
    tls: {
      // если начнутся проблемы с сертификатами — можно временно true,
      // но лучше держать false. Оставляю false.
      rejectUnauthorized: false,
      servername: host,
    },
  };
}

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport(buildTransportOptions());
  return transporter;
}

export function canSendEmail() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

async function sendWithRetry(sendFn, retries = 2) {
  let lastErr = null;
  for (let i = 0; i < retries; i++) {
    try {
      const tr = getTransporter();
      // ✅ проверка канала (иногда сразу показывает причину)
      await tr.verify();
      return await sendFn(tr);
    } catch (e) {
      lastErr = e;
      // небольшая пауза перед повтором
      await new Promise((r) => setTimeout(r, 800));
      // сбрасываем transporter на всякий случай
      transporter = null;
    }
  }
  throw lastErr;
}

// ✅ Обычная отправка письма (OTP)
export async function sendMail({ to, subject, text }) {
  if (!canSendEmail()) throw new Error("SMTP not configured");

  return sendWithRetry(async (tr) => {
    const info = await tr.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    return { ok: true, messageId: info.messageId };
  });
}

// ✅ Отправка с PDF вложением
export async function sendMailWithAttachment({
  to,
  subject,
  text,
  filename,
  content,
}) {
  if (!canSendEmail()) throw new Error("SMTP not configured");

  return sendWithRetry(async (tr) => {
    const info = await tr.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      attachments: [
        {
          filename: filename || "incident.pdf",
          content,
          contentType: "application/pdf",
        },
      ],
    });
    return { ok: true, messageId: info.messageId };
  });
}