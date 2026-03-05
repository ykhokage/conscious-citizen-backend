import nodemailer from "nodemailer";

export function canSendEmail() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

export async function sendMailWithAttachment({
  to,
  subject,
  text,
  filename,
  content,
}) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
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

  return { ok: true };
}