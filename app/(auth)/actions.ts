"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { hashPassword, PASSWORD_MIN, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, destroyUserSessions, userCount } from "@/lib/auth/session";
import { createResetLink } from "@/lib/auth/reset";
import { checkBlocked, getClientIp, getUserAgent, recordAttempt } from "@/lib/security/guard";
import { getSetting } from "@/lib/settings";
import { newId, nowIso } from "@/lib/utils";
import { sha256 } from "@/lib/crypto";
import { LOCALE_COOKIE } from "@/i18n/request";

export type FormState = { error?: string; success?: string; link?: string } | undefined;

// Real hash verified when the account does not exist, so response time does not reveal valid emails.
let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= hashPassword("not-a-real-password");
  return dummyHash;
}

function minutesUntil(iso?: string) {
  if (!iso) return 60;
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const t = await getTranslations("auth");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = await getClientIp();

  const block = await checkBlocked("login", ip, email);
  if (block.blocked) return { error: t("blocked", { minutes: minutesUntil(block.until) }) };

  const db = await getDb();
  const user = await db.selectFrom("users").selectAll().where("email", "=", email).executeTakeFirst();
  const ok = await verifyPassword(user?.password_hash ?? (await getDummyHash()), password);
  if (!user || !ok || !user.active) {
    await recordAttempt("login", ip, email, false);
    const after = await checkBlocked("login", ip, email);
    if (after.blocked) return { error: t("blocked", { minutes: minutesUntil(after.until) }) };
    return { error: t("invalidCredentials") };
  }
  await recordAttempt("login", ip, email, true);
  await createSession(user.id, { ip, userAgent: await getUserAgent() });
  if (user.locale) (await cookies()).set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 31536000 });
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

const setupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  password: z.string().min(PASSWORD_MIN),
});

export async function setupAction(_: FormState, form: FormData): Promise<FormState> {
  const t = await getTranslations("auth");
  if ((await userCount()) > 0) redirect("/login");
  const parsed = setupSchema.safeParse({
    name: form.get("name"),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    password: form.get("password"),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === "password" ? t("passwordTooShort") : field === "email" ? t("invalidEmail") : t("name") };
  }
  const db = await getDb();
  const id = newId();
  await db
    .insertInto("users")
    .values({
      id,
      email: parsed.data.email,
      name: parsed.data.name,
      password_hash: await hashPassword(parsed.data.password),
      role: "admin",
      active: 1,
      locale: await getLocale(),
      created_at: nowIso(),
      last_login_at: null,
    })
    .execute();
  await createSession(id, { ip: await getClientIp(), userAgent: await getUserAgent() });
  redirect("/dashboard");
}

export async function forgotAction(_: FormState, form: FormData): Promise<FormState> {
  const t = await getTranslations("auth");
  const auth = await getSetting("auth");
  if (!auth.forgotPasswordEnabled) return { error: t("forgotDisabled") };
  const ip = await getClientIp();
  const email = String(form.get("email") ?? "").trim().toLowerCase();

  const block = await checkBlocked("forgot", ip, null);
  if (block.blocked) return { error: t("blocked", { minutes: minutesUntil(block.until) }) };
  // Every request counts, so the endpoint cannot be used to spam or enumerate.
  await recordAttempt("forgot", ip, null, false);

  const db = await getDb();
  const user = await db.selectFrom("users").selectAll().where("email", "=", email).executeTakeFirst();
  if (user && user.active) {
    try {
      const origin = (await headers()).get("origin") ?? undefined;
      await createResetLink(user, { sendEmail: true, origin, locale: user.locale ?? (await getLocale()) });
    } catch (e) {
      console.error("[forgot] unable to send reset email:", (e as Error).message);
    }
  }
  return { success: t("forgotSent") };
}

export async function resetAction(_: FormState, form: FormData): Promise<FormState> {
  const t = await getTranslations("auth");
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < PASSWORD_MIN) return { error: t("passwordTooShort") };
  if (password !== confirm) return { error: t("passwordMismatch") };

  const db = await getDb();
  const reset = await db
    .selectFrom("password_resets")
    .selectAll()
    .where("id", "=", sha256(token))
    .executeTakeFirst();
  if (!reset || reset.used_at || reset.expires_at < nowIso()) return { error: t("resetInvalid") };

  await db
    .updateTable("users")
    .set({ password_hash: await hashPassword(password) })
    .where("id", "=", reset.user_id)
    .execute();
  await db.updateTable("password_resets").set({ used_at: nowIso() }).where("id", "=", reset.id).execute();
  await destroyUserSessions(reset.user_id);
  return { success: t("resetDone") };
}

export async function setLocaleAction(locale: string) {
  const value = locale === "en" ? "en" : "fr";
  (await cookies()).set(LOCALE_COOKIE, value, { path: "/", maxAge: 31536000, sameSite: "lax" });
}
