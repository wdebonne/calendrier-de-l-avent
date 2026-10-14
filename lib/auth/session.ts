import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import type { User } from "@/lib/db/types";
import { randomToken, sha256 } from "@/lib/crypto";
import { getSetting } from "@/lib/settings";
import { nowIso } from "@/lib/utils";

const COOKIE = "advent_sid";

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const db = await getDb();
  const { sessionDays } = await getSetting("auth");
  const token = randomToken();
  const expires = new Date(Date.now() + sessionDays * 86_400_000);
  await db
    .insertInto("sessions")
    .values({
      id: sha256(token),
      user_id: userId,
      expires_at: expires.toISOString(),
      created_at: nowIso(),
      ip: meta.ip ?? null,
      user_agent: meta.userAgent?.slice(0, 300) ?? null,
    })
    .execute();
  await db.updateTable("users").set({ last_login_at: nowIso() }).where("id", "=", userId).execute();
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.deleteFrom("sessions").where("id", "=", sha256(token)).execute();
  }
  jar.delete(COOKIE);
}

export async function destroyUserSessions(userId: string) {
  const db = await getDb();
  await db.deleteFrom("sessions").where("user_id", "=", userId).execute();
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const row = await db
    .selectFrom("sessions")
    .innerJoin("users", "users.id", "sessions.user_id")
    .selectAll("users")
    .select("sessions.expires_at as session_expires")
    .where("sessions.id", "=", sha256(token))
    .executeTakeFirst();
  if (!row || row.session_expires < nowIso() || !row.active) return null;
  const { session_expires: _ignored, ...user } = row;
  return user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

export async function userCount(): Promise<number> {
  const db = await getDb();
  const r = await db.selectFrom("users").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst();
  return Number(r?.n ?? 0);
}
