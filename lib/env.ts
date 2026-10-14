import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Runtime data lives outside the build: the ignore hints stop the bundler from tracing these paths.
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data"));
export const UPLOAD_DIR = path.join(/*turbopackIgnore: true*/ DATA_DIR, "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let cachedSecret: string | null = null;

/**
 * Secret used to sign cookies and encrypt stored credentials.
 * Taken from APP_SECRET, otherwise generated once and persisted in the data volume.
 */
export function appSecret(): string {
  if (cachedSecret) return cachedSecret;
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 16) {
    cachedSecret = process.env.APP_SECRET;
    return cachedSecret;
  }
  const file = path.join(DATA_DIR, "secret.key");
  if (fs.existsSync(file)) {
    cachedSecret = fs.readFileSync(file, "utf8").trim();
  } else {
    cachedSecret = crypto.randomBytes(48).toString("base64url");
    fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

export function appUrl(fallbackOrigin?: string): string {
  const url = process.env.APP_URL || fallbackOrigin || "http://localhost:3000";
  return url.replace(/\/+$/, "");
}

export const trustProxy = process.env.TRUST_PROXY !== "false";
