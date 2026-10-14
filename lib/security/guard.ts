import "server-only";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import type { IpRule } from "@/lib/db/types";
import { trustProxy } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { addMinutes, newId, nowIso } from "@/lib/utils";
import { blockDurationMinutes, evaluateIpRules, type IpDecision } from "./ip";

export function clientIpFromHeaders(h: Headers): string {
  if (trustProxy) {
    // X-Real-IP is overwritten by the reverse proxy; in X-Forwarded-For only the last entry was
    // added by our proxy, earlier ones are client-controlled and could be spoofed.
    const real = h.get("x-real-ip");
    if (real) return real.trim();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",").pop()!.trim();
  }
  return h.get("x-client-ip") || "0.0.0.0";
}

export async function getClientIp(): Promise<string> {
  return clientIpFromHeaders(await headers());
}

export async function getUserAgent(): Promise<string> {
  return ((await headers()).get("user-agent") || "").slice(0, 300);
}

// IP rules are read on every request; keep a short in-memory cache invalidated on change.
const ruleCache = globalThis as unknown as { __advent_rules?: { at: number; rules: IpRule[] } };

export async function getIpRules(): Promise<IpRule[]> {
  const cached = ruleCache.__advent_rules;
  if (cached && Date.now() - cached.at < 30_000) return cached.rules;
  const db = await getDb();
  const rules = await db.selectFrom("ip_rules").selectAll().orderBy("created_at", "desc").execute();
  ruleCache.__advent_rules = { at: Date.now(), rules };
  return rules;
}

export function invalidateIpRules() {
  ruleCache.__advent_rules = undefined;
}

export async function ipDecision(ip: string): Promise<IpDecision> {
  return evaluateIpRules(ip, await getIpRules());
}

export interface BlockStatus {
  blocked: boolean;
  until?: string;
}

/** Checks whether an IP (or an account identifier) is currently blocked for a scope. */
export async function checkBlocked(scope: string, ip: string, identifier?: string | null): Promise<BlockStatus> {
  const security = await getSetting("security");
  if (!security.enabled) return { blocked: false };
  const decision = await ipDecision(ip);
  if (decision === "allow") return { blocked: false };
  if (decision === "deny") return { blocked: true };
  const db = await getDb();
  const now = nowIso();
  let q = db.selectFrom("ip_blocks").select(["until"]).where("scope", "=", scope).where("until", ">", now);
  q = q.where((eb) => {
    const ors = [eb("ip", "=", ip)];
    if (identifier && security.lockAccounts) ors.push(eb("identifier", "=", identifier));
    return eb.or(ors);
  });
  const block = await q.orderBy("until", "desc").executeTakeFirst();
  return block ? { blocked: true, until: block.until } : { blocked: false };
}

/**
 * Records an attempt. After `maxAttempts` failures inside the window, the IP (and optionally the
 * account) is blocked; durations double for repeat offenders when progressive mode is on.
 */
export async function recordAttempt(scope: string, ip: string, identifier: string | null, success: boolean) {
  const db = await getDb();
  const security = await getSetting("security");
  await db
    .insertInto("login_attempts")
    .values({ id: newId(), ip, identifier, scope, success: success ? 1 : 0, created_at: nowIso() })
    .execute();
  if (!security.enabled || success) {
    if (success) {
      // A success resets the counter for this IP and scope.
      await db
        .deleteFrom("login_attempts")
        .where("scope", "=", scope)
        .where("ip", "=", ip)
        .where("success", "=", 0)
        .execute();
    }
    return;
  }
  if ((await ipDecision(ip)) === "allow") return;

  const since = addMinutes(new Date(), -security.windowMinutes).toISOString();
  const byIp = await db
    .selectFrom("login_attempts")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("scope", "=", scope)
    .where("ip", "=", ip)
    .where("success", "=", 0)
    .where("created_at", ">", since)
    .executeTakeFirst();
  let byAccount = 0;
  if (identifier && security.lockAccounts) {
    const r = await db
      .selectFrom("login_attempts")
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .where("scope", "=", scope)
      .where("identifier", "=", identifier)
      .where("success", "=", 0)
      .where("created_at", ">", since)
      .executeTakeFirst();
    byAccount = Number(r?.n ?? 0);
  }

  const ipFailures = Number(byIp?.n ?? 0);
  if (ipFailures < security.maxAttempts && byAccount < security.maxAttempts * 2) return;

  const dayAgo = addMinutes(new Date(), -24 * 60).toISOString();
  const previous = await db
    .selectFrom("ip_blocks")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("scope", "=", scope)
    .where("ip", "=", ip)
    .where("created_at", ">", dayAgo)
    .executeTakeFirst();
  const minutes = blockDurationMinutes(security.blockMinutes, Number(previous?.n ?? 0), security.progressive);
  await db
    .insertInto("ip_blocks")
    .values({
      id: newId(),
      ip: ipFailures >= security.maxAttempts ? ip : null,
      identifier: byAccount >= security.maxAttempts * 2 ? identifier : null,
      scope,
      until: addMinutes(new Date(), minutes).toISOString(),
      reason: `${Math.max(ipFailures, byAccount)} échecs / failures`,
      created_at: nowIso(),
    })
    .execute();
  // Start a fresh window once blocked.
  await db
    .deleteFrom("login_attempts")
    .where("scope", "=", scope)
    .where("ip", "=", ip)
    .where("success", "=", 0)
    .execute();
}

/** Simple sliding-window rate limit kept in memory (used for challenge answers). */
const buckets = globalThis as unknown as { __advent_rl?: Map<string, number[]> };
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  if (!buckets.__advent_rl) buckets.__advent_rl = new Map();
  const now = Date.now();
  const list = (buckets.__advent_rl.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    buckets.__advent_rl.set(key, list);
    return false;
  }
  list.push(now);
  buckets.__advent_rl.set(key, list);
  return true;
}
