import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export function canSendEmail() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail({ to, subject, text, html, attachments }) {
  if (!canSendEmail() || !resend) {
    throw new Error("Email service is not configured");
  }

  const { data, error } = await resend.emails.send({
    from: process.env.MAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
    html,
    attachments,
  });

  if (error) {
    throw new Error(error.message || "Failed to send email");
  }

  return data;
}