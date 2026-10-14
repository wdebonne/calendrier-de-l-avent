import "server-only";
import nodemailer from "nodemailer";
import { getSetting, type SmtpSettings } from "@/lib/settings";

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

function transport(smtp: SmtpSettings) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
}

export async function sendMail(to: string, subject: string, text: string, smtpOverride?: SmtpSettings) {
  const smtp = smtpOverride ?? (await getSetting("smtp"));
  if (!smtp.enabled && !smtpOverride) throw new Error("SMTP is disabled");
  if (!smtp.host) throw new Error("SMTP host is not configured");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>")}</div>`;
  await transport(smtp).sendMail({
    from: smtp.fromName ? `"${smtp.fromName.replace(/"/g, "")}" <${smtp.fromEmail}>` : smtp.fromEmail,
    to,
    subject,
    text,
    html,
  });
}

export async function verifySmtp(smtp: SmtpSettings) {
  await transport(smtp).verify();
}
