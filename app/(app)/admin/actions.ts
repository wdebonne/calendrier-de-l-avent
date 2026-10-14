"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { getDb, type PostgresConfig } from "@/lib/db";
import { copyToPostgres, readSavedPostgres, removeDbConfig, testPostgres, writePostgresConfig } from "@/lib/db/switch";
import { currentDbConfig } from "@/lib/db";
import { hashPassword, PASSWORD_MIN } from "@/lib/auth/password";
import { createResetLink } from "@/lib/auth/reset";
import { destroyUserSessions, requireAdmin } from "@/lib/auth/session";
import { sendMail, verifySmtp } from "@/lib/mailer";
import { getClientIp, invalidateIpRules } from "@/lib/security/guard";
import { evaluateIpRules, isValidCidr } from "@/lib/security/ip";
import { getSetting, setSetting, type SmtpSettings } from "@/lib/settings";
import { newId, nowIso } from "@/lib/utils";

export type AdminState = { error?: string; success?: string; link?: string } | undefined;

const num = (form: FormData, key: string, min: number, max: number, fallback: number) => {
  const n = Number(form.get(key));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
};
const str = (form: FormData, key: string, max = 500) => String(form.get(key) ?? "").trim().slice(0, max);
const bool = (form: FormData, key: string) => form.get(key) === "on";

async function origin() {
  return (await headers()).get("origin") ?? undefined;
}

// ---------------------------------------------------------------- Users

const userSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  role: z.enum(["admin", "creator"]),
});

export async function createUserAction(_: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const t = await getTranslations("admin");
  const ta = await getTranslations("auth");
  const parsed = userSchema.safeParse({
    name: form.get("name"),
    email: str(form, "email").toLowerCase(),
    role: form.get("role"),
  });
  if (!parsed.success) return { error: ta("invalidEmail") };
  const password = String(form.get("password") ?? "");
  const invite = bool(form, "invite");
  if (!invite && password.length < PASSWORD_MIN) return { error: ta("passwordTooShort") };

  const db = await getDb();
  if (await db.selectFrom("users").select("id").where("email", "=", parsed.data.email).executeTakeFirst()) {
    return { error: t("emailTaken") };
  }
  const id = newId();
  await db
    .insertInto("users")
    .values({
      id,
      ...parsed.data,
      // Invited users get an unusable random password until they set theirs.
      password_hash: await hashPassword(invite ? crypto.randomUUID() + crypto.randomUUID() : password),
      active: 1,
      locale: null,
      created_at: nowIso(),
      last_login_at: null,
    })
    .execute();
  revalidatePath("/admin/users");
  if (invite) {
    const user = (await db.selectFrom("users").selectAll().where("id", "=", id).executeTakeFirst())!;
    try {
      const { link, emailed } = await createResetLink(user, {
        sendEmail: true,
        origin: await origin(),
        locale: await getLocale(),
        minutes: 60 * 24 * 7,
      });
      return emailed ? { success: `${t("userCreated")} ${t("resetLinkSent")}` } : { success: t("userCreated"), link };
    } catch (e) {
      const { link } = await createResetLink(user, { sendEmail: false, origin: await origin(), minutes: 60 * 24 * 7 });
      return { success: t("userCreated"), error: (e as Error).message, link };
    }
  }
  return { success: t("userCreated") };
}

export async function updateUserAction(userId: string, _: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const t = await getTranslations("admin");
  const ta = await getTranslations("auth");
  const tc = await getTranslations("common");
  const parsed = userSchema.safeParse({
    name: form.get("name"),
    email: str(form, "email").toLowerCase(),
    role: form.get("role"),
  });
  if (!parsed.success) return { error: ta("invalidEmail") };
  const active = bool(form, "active");
  if (userId === admin.id && (!active || parsed.data.role !== "admin")) return { error: t("cannotDeleteSelf") };
  const db = await getDb();
  const clash = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", parsed.data.email)
    .where("id", "!=", userId)
    .executeTakeFirst();
  if (clash) return { error: t("emailTaken") };
  const password = String(form.get("password") ?? "");
  if (password && password.length < PASSWORD_MIN) return { error: ta("passwordTooShort") };
  await db
    .updateTable("users")
    .set({
      ...parsed.data,
      active: active ? 1 : 0,
      ...(password ? { password_hash: await hashPassword(password) } : {}),
    })
    .where("id", "=", userId)
    .execute();
  if (!active || password) await destroyUserSessions(userId);
  revalidatePath("/admin/users");
  return { success: tc("saved") };
}

export async function deleteUserAction(userId: string): Promise<AdminState> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { error: (await getTranslations("admin"))("cannotDeleteSelf") };
  const db = await getDb();
  const calendars = await db.selectFrom("calendars").select("id").where("owner_id", "=", userId).execute();
  const ids = calendars.map((c) => c.id);
  if (ids.length) {
    await db.deleteFrom("day_events").where("calendar_id", "in", ids).execute();
    await db.deleteFrom("visits").where("calendar_id", "in", ids).execute();
    await db.deleteFrom("days").where("calendar_id", "in", ids).execute();
    await db.deleteFrom("calendars").where("id", "in", ids).execute();
  }
  await db.deleteFrom("sessions").where("user_id", "=", userId).execute();
  await db.deleteFrom("password_resets").where("user_id", "=", userId).execute();
  await db.deleteFrom("media").where("owner_id", "=", userId).execute();
  await db.deleteFrom("users").where("id", "=", userId).execute();
  revalidatePath("/admin/users");
  return { success: "ok" };
}

export async function sendResetLinkAction(userId: string): Promise<AdminState> {
  await requireAdmin();
  const t = await getTranslations("admin");
  const db = await getDb();
  const user = await db.selectFrom("users").selectAll().where("id", "=", userId).executeTakeFirst();
  if (!user) return { error: "404" };
  try {
    const { link, emailed } = await createResetLink(user, { sendEmail: true, origin: await origin(), locale: user.locale ?? (await getLocale()) });
    return emailed ? { success: t("resetLinkSent") } : { success: t("resetLinkCopy"), link };
  } catch (e) {
    const { link } = await createResetLink(user, { sendEmail: false, origin: await origin() });
    return { error: (e as Error).message, link };
  }
}

// ---------------------------------------------------------------- Settings

export async function saveGeneralAction(_: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  await setSetting("general", {
    appName: str(form, "appName", 80) || "Calendrier de l'Avent",
    defaultLocale: form.get("defaultLocale") === "en" ? "en" : "fr",
    maxUploadMb: num(form, "maxUploadMb", 1, 500, 50),
    slugLength: num(form, "slugLength", 6, 20, 10),
  });
  const auth = await getSetting("auth");
  await setSetting("auth", { ...auth, sessionDays: num(form, "sessionDays", 1, 365, 14) });
  revalidatePath("/", "layout");
  return { success: (await getTranslations("common"))("saved") };
}

function smtpFromForm(form: FormData, current: SmtpSettings): SmtpSettings {
  const password = String(form.get("password") ?? "");
  return {
    enabled: bool(form, "enabled"),
    host: str(form, "host", 200),
    port: num(form, "port", 1, 65535, 587),
    secure: bool(form, "secure"),
    user: str(form, "user", 200),
    password: password || current.password,
    fromEmail: str(form, "fromEmail", 200),
    fromName: str(form, "fromName", 100),
  };
}

export async function saveSmtpAction(_: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  await setSetting("smtp", smtpFromForm(form, await getSetting("smtp")));
  return { success: (await getTranslations("common"))("saved") };
}

/** Sends a test email with the values currently in the form (saved or not). */
export async function testSmtpAction(form: FormData): Promise<AdminState> {
  await requireAdmin();
  const t = await getTranslations("admin.smtp");
  const smtp = smtpFromForm(form, await getSetting("smtp"));
  const to = str(form, "testTo", 200);
  const general = await getSetting("general");
  try {
    await verifySmtp(smtp);
    await sendMail(to, t("testSubject"), t("testBody", { app: general.appName }), { ...smtp, enabled: true });
    return { success: t("testOk") };
  } catch (e) {
    return { error: t("testFail", { error: (e as Error).message }) };
  }
}

export async function saveAuthAction(_: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const auth = await getSetting("auth");
  await setSetting("auth", {
    ...auth,
    forgotPasswordEnabled: bool(form, "forgotPasswordEnabled"),
    resetTokenMinutes: num(form, "resetTokenMinutes", 5, 60 * 24 * 7, 60),
    templates: {
      fr: { subject: str(form, "fr_subject", 200), body: String(form.get("fr_body") ?? "").slice(0, 5000) },
      en: { subject: str(form, "en_subject", 200), body: String(form.get("en_body") ?? "").slice(0, 5000) },
    },
  });
  return { success: (await getTranslations("common"))("saved") };
}

export async function saveSecurityAction(_: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  await setSetting("security", {
    enabled: bool(form, "enabled"),
    maxAttempts: num(form, "maxAttempts", 1, 100, 5),
    windowMinutes: num(form, "windowMinutes", 1, 1440, 15),
    blockMinutes: num(form, "blockMinutes", 1, 1440, 15),
    progressive: bool(form, "progressive"),
    lockAccounts: bool(form, "lockAccounts"),
    protectCalendars: bool(form, "protectCalendars"),
    challengeMaxAttemptsPerMinute: num(form, "challengeMaxAttemptsPerMinute", 1, 1000, 20),
  });
  return { success: (await getTranslations("common"))("saved") };
}

export async function addIpRuleAction(_: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const t = await getTranslations("admin.security");
  const cidr = str(form, "cidr", 60);
  const type = form.get("type") === "deny" ? "deny" : "allow";
  if (!isValidCidr(cidr)) return { error: t("invalidCidr") };
  const db = await getDb();
  if (type === "deny") {
    // Refuse a rule that would lock the administrator out (unless they are whitelisted).
    const ip = await getClientIp();
    const rules = await db.selectFrom("ip_rules").select(["cidr", "type"]).execute();
    if (evaluateIpRules(ip, [...rules, { cidr, type }]) === "deny") return { error: t("selfDeny", { ip }) };
  }
  await db.insertInto("ip_rules").values({ id: newId(), cidr, type, note: str(form, "note", 200) || null, created_at: nowIso() }).execute();
  invalidateIpRules();
  revalidatePath("/admin/settings/security");
  return { success: (await getTranslations("common"))("saved") };
}

export async function deleteIpRuleAction(id: string) {
  await requireAdmin();
  const db = await getDb();
  await db.deleteFrom("ip_rules").where("id", "=", id).execute();
  invalidateIpRules();
  revalidatePath("/admin/settings/security");
}

export async function unblockAction(id: string | null) {
  await requireAdmin();
  const db = await getDb();
  if (id) {
    const block = await db.selectFrom("ip_blocks").selectAll().where("id", "=", id).executeTakeFirst();
    await db.deleteFrom("ip_blocks").where("id", "=", id).execute();
    if (block?.ip) await db.deleteFrom("login_attempts").where("ip", "=", block.ip).where("success", "=", 0).execute();
  } else {
    await db.deleteFrom("ip_blocks").execute();
    await db.deleteFrom("login_attempts").where("success", "=", 0).execute();
  }
  revalidatePath("/admin/settings/security");
}

export async function clearAttemptsAction() {
  await requireAdmin();
  const db = await getDb();
  await db.deleteFrom("login_attempts").execute();
  revalidatePath("/admin/settings/security");
}

// ---------------------------------------------------------------- Database

function pgFromForm(form: FormData, fallbackPassword?: string): PostgresConfig {
  return {
    host: str(form, "host", 200),
    port: num(form, "port", 1, 65535, 5432),
    database: str(form, "database", 100),
    user: str(form, "user", 100),
    password: String(form.get("password") ?? "") || fallbackPassword || "",
    ssl: bool(form, "ssl"),
  };
}

export async function testPostgresAction(form: FormData): Promise<AdminState> {
  await requireAdmin();
  const t = await getTranslations("admin.database");
  try {
    const version = await testPostgres(pgFromForm(form, readSavedPostgres()?.password));
    return { success: t("testOk", { version }) };
  } catch (e) {
    return { error: t("testFail", { error: (e as Error).message }) };
  }
}

export async function migratePostgresAction(form: FormData): Promise<AdminState> {
  await requireAdmin();
  const t = await getTranslations("admin.database");
  if (currentDbConfig().source === "env") return { error: t("envLocked") };
  const cfg = pgFromForm(form, readSavedPostgres()?.password);
  try {
    const rows = await copyToPostgres(cfg);
    writePostgresConfig(cfg);
    return { success: t("migrateOk", { rows }) };
  } catch (e) {
    return { error: t("migrateFail", { error: (e as Error).message }) };
  }
}

export async function revertToSqliteAction(): Promise<AdminState> {
  await requireAdmin();
  const t = await getTranslations("admin.database");
  if (currentDbConfig().source === "env") return { error: t("envLocked") };
  removeDbConfig();
  return { success: t("pendingRestart") };
}

export async function restartAction() {
  await requireAdmin();
  // The container restart policy brings the app back with the new configuration.
  setTimeout(() => process.exit(0), 500);
  return { success: "restarting" };
}
