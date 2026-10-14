import "server-only";
import { getDb } from "@/lib/db";
import type { User } from "@/lib/db/types";
import { randomToken, sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { renderTemplate, sendMail } from "@/lib/mailer";
import { getSetting } from "@/lib/settings";
import { addMinutes, nowIso } from "@/lib/utils";

/**
 * Creates a single-use reset link. When `sendEmail` is true and SMTP is enabled, the link is
 * emailed using the template configured in the admin settings; the link is always returned
 * so an administrator can share it manually when SMTP is off.
 */
export async function createResetLink(
  user: User,
  opts: { sendEmail: boolean; origin?: string; locale?: string; minutes?: number },
): Promise<{ link: string; emailed: boolean }> {
  const db = await getDb();
  const auth = await getSetting("auth");
  const general = await getSetting("general");
  const minutes = opts.minutes ?? auth.resetTokenMinutes;
  const token = randomToken();
  await db
    .insertInto("password_resets")
    .values({
      id: sha256(token),
      user_id: user.id,
      expires_at: addMinutes(new Date(), minutes).toISOString(),
      used_at: null,
      created_at: nowIso(),
    })
    .execute();
  const link = `${appUrl(opts.origin)}/reset?token=${token}`;

  const smtp = await getSetting("smtp");
  if (!opts.sendEmail || !smtp.enabled) return { link, emailed: false };

  const tpl = opts.locale === "en" ? auth.templates.en : auth.templates.fr;
  const vars = { name: user.name, link, minutes: String(minutes), app: general.appName, email: user.email };
  await sendMail(user.email, renderTemplate(tpl.subject, vars), renderTemplate(tpl.body, vars));
  return { link, emailed: true };
}
