import "server-only";
import { getDb } from "@/lib/db";
import { nowIso } from "@/lib/utils";
import { decrypt, encrypt } from "@/lib/crypto";

export interface GeneralSettings {
  appName: string;
  defaultLocale: "fr" | "en";
  maxUploadMb: number;
  slugLength: number;
}

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** Stored encrypted; decrypted on read. */
  password: string;
  fromEmail: string;
  fromName: string;
}

export interface MailTemplate {
  subject: string;
  body: string;
}

export interface AuthSettings {
  forgotPasswordEnabled: boolean;
  resetTokenMinutes: number;
  sessionDays: number;
  templates: { fr: MailTemplate; en: MailTemplate };
}

export interface SecuritySettings {
  enabled: boolean;
  maxAttempts: number;
  windowMinutes: number;
  blockMinutes: number;
  progressive: boolean;
  /** Also lock the targeted account (not only the IP). */
  lockAccounts: boolean;
  /** Apply limits to calendar passwords and day challenges too. */
  protectCalendars: boolean;
  challengeMaxAttemptsPerMinute: number;
}

export interface SettingsMap {
  general: GeneralSettings;
  smtp: SmtpSettings;
  auth: AuthSettings;
  security: SecuritySettings;
}

export const DEFAULT_SETTINGS: SettingsMap = {
  general: { appName: "Calendrier de l'Avent", defaultLocale: "fr", maxUploadMb: 50, slugLength: 10 },
  smtp: {
    enabled: false,
    host: "",
    port: 587,
    secure: false,
    user: "",
    password: "",
    fromEmail: "",
    fromName: "Calendrier de l'Avent",
  },
  auth: {
    forgotPasswordEnabled: true,
    resetTokenMinutes: 60,
    sessionDays: 14,
    templates: {
      fr: {
        subject: "Réinitialisation de votre mot de passe",
        body:
          "Bonjour {{name}},\n\nVous avez demandé à réinitialiser votre mot de passe sur {{app}}.\n" +
          "Cliquez sur le lien ci-dessous (valable {{minutes}} minutes) :\n\n{{link}}\n\n" +
          "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
      },
      en: {
        subject: "Reset your password",
        body:
          "Hello {{name}},\n\nYou asked to reset your password on {{app}}.\n" +
          "Click the link below (valid for {{minutes}} minutes):\n\n{{link}}\n\n" +
          "If you did not request this, you can ignore this email.",
      },
    },
  },
  security: {
    enabled: true,
    maxAttempts: 5,
    windowMinutes: 15,
    blockMinutes: 15,
    progressive: true,
    lockAccounts: true,
    protectCalendars: true,
    challengeMaxAttemptsPerMinute: 20,
  },
};

function merge<T>(defaults: T, value: unknown): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const d = (defaults as Record<string, unknown>)[k];
    out[k] = d && typeof d === "object" && !Array.isArray(d) ? merge(d, v) : v;
  }
  return out as T;
}

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const db = await getDb();
  const row = await db.selectFrom("settings").select("value").where("key", "=", key).executeTakeFirst();
  let parsed: unknown = undefined;
  if (row) {
    try {
      parsed = JSON.parse(row.value);
    } catch {
      parsed = undefined;
    }
  }
  const value = merge(DEFAULT_SETTINGS[key], parsed);
  if (key === "smtp") {
    const smtp = value as SmtpSettings;
    smtp.password = smtp.password ? decrypt(smtp.password) ?? "" : "";
  }
  return value;
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) {
  const db = await getDb();
  let stored: unknown = value;
  if (key === "smtp") {
    const smtp = value as SmtpSettings;
    stored = { ...smtp, password: smtp.password ? encrypt(smtp.password) : "" };
  }
  const json = JSON.stringify(stored);
  const now = nowIso();
  const existing = await db.selectFrom("settings").select("key").where("key", "=", key).executeTakeFirst();
  if (existing) {
    await db.updateTable("settings").set({ value: json, updated_at: now }).where("key", "=", key).execute();
  } else {
    await db.insertInto("settings").values({ key, value: json, updated_at: now }).execute();
  }
}
