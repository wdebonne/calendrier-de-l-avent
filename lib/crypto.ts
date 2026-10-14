import "server-only";
import crypto from "node:crypto";
import { appSecret } from "@/lib/env";

function key(purpose: string): Buffer {
  return crypto.createHash("sha256").update(`${purpose}:${appSecret()}`).digest();
}

/** AES-256-GCM encryption for secrets stored in the database (SMTP password, Postgres password). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key("enc"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${data.toString("base64url")}`;
}

export function decrypt(payload: string): string | null {
  try {
    const [v, iv, tag, data] = payload.split(":");
    if (v !== "v1") return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key("enc"), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function hmac(value: string, purpose = "sign"): string {
  return crypto.createHmac("sha256", key(purpose)).update(value).digest("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Salted, non-reversible IP hash for statistics (GDPR friendly). */
export function hashIp(ip: string): string {
  return hmac(ip, "ip").slice(0, 16);
}
