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
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    tls: {
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

async function sendWithRetry(sendFn, retries = 1) {
  let lastErr = null;

  for (let i = 0; i <= retries; i++) {
    try {
      const tr = getTransporter();
      return await sendFn(tr);
    } catch (e) {
      lastErr = e;
      transporter = null;

      if (i < retries) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  throw lastErr;
}

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