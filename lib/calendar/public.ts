import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import type { Calendar, Day, User } from "@/lib/db/types";
import { hmac, randomToken, safeEqual } from "@/lib/crypto";
import { toPublicChallenge, type Challenge, type PublicChallenge } from "@/lib/challenges";
import { safeJson } from "@/lib/utils";
import { dayNumber, isDayAvailable } from "./dates";

const VISITOR_COOKIE = "advent_vid";

export async function loadCalendarBySlug(slug: string): Promise<Calendar | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const db = await getDb();
  return (await db.selectFrom("calendars").selectAll().where("slug", "=", slug).executeTakeFirst()) ?? null;
}

export function canManage(user: User | null, cal: Calendar): boolean {
  return !!user && (user.role === "admin" || user.id === cal.owner_id);
}

function accessCookieName(cal: Calendar) {
  return `advent_cal_${cal.id.slice(0, 8)}`;
}

function accessToken(cal: Calendar) {
  // Tied to the password hash: changing the password revokes existing access.
  return hmac(`${cal.id}:${cal.password_hash}`, "cal-access");
}

export async function hasPasswordAccess(cal: Calendar): Promise<boolean> {
  if (!cal.password_hash) return true;
  const value = (await cookies()).get(accessCookieName(cal))?.value;
  return !!value && safeEqual(value, accessToken(cal));
}

export async function grantPasswordAccess(cal: Calendar) {
  (await cookies()).set(accessCookieName(cal), accessToken(cal), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
}

/** Anonymous, random visitor id used to compute unique visitors and per-visitor challenge state. */
export async function getVisitorId(create = true): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
  if (!create) return null;
  const id = randomToken(16);
  jar.set(VISITOR_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return id;
}

export type ViewerContext = {
  manager: boolean;
  preview: boolean;
};

/** Whether the viewer may see the calendar at all (published / password / manager). */
export async function checkCalendarAccess(cal: Calendar, ctx: ViewerContext): Promise<"ok" | "unpublished" | "password"> {
  if (ctx.manager) return "ok";
  if (!cal.published) return "unpublished";
  if (!(await hasPasswordAccess(cal))) return "password";
  return "ok";
}

export interface PublicDay {
  id: string;
  date: string;
  number: number;
  label: string | null;
  cover_url: string | null;
  available: boolean;
  hasContent: boolean;
  challenge: PublicChallenge | null;
  solved: boolean;
  attemptsUsed: number;
}

export async function buildPublicDays(cal: Calendar, days: Day[], ctx: ViewerContext, visitorId: string | null): Promise<PublicDay[]> {
  const db = await getDb();
  const solved = new Set<string>();
  const attempts = new Map<string, number>();
  if (visitorId && days.some((d) => d.challenge)) {
    const events = await db
      .selectFrom("day_events")
      .select(["day_id", "type"])
      .where("calendar_id", "=", cal.id)
      .where("visitor_id", "=", visitorId)
      .where("type", "in", ["solve", "fail"])
      .execute();
    for (const e of events) {
      if (e.type === "solve") solved.add(e.day_id);
      else attempts.set(e.day_id, (attempts.get(e.day_id) ?? 0) + 1);
    }
  }
  return days.map((d) => {
    const challenge = safeJson<Challenge | null>(d.challenge, null);
    return {
      id: d.id,
      date: d.date,
      number: dayNumber(d.date),
      label: d.label,
      cover_url: d.cover_url,
      available: ctx.preview || isDayAvailable(d.date, cal),
      hasContent: !!(d.content_url || d.content_text),
      challenge: challenge ? toPublicChallenge(challenge, d.id) : null,
      solved: solved.has(d.id),
      attemptsUsed: attempts.get(d.id) ?? 0,
    };
  });
}

export interface DayContent {
  type: Day["content_type"];
  url: string | null;
  embedUrl: string | null;
  text: string | null;
  label: string | null;
  number: number;
  animation: string;
  message?: string;
}

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (u.hostname.endsWith("youtube.com") || u.hostname.endsWith("youtube-nocookie.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = /\/(embed|shorts|live)\/([\w-]{6,})/.exec(u.pathname);
      if (m) return m[2];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

function vimeoId(url: string): string | null {
  const m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  return m ? m[1] : null;
}

export function dayContent(cal: Calendar, day: Day, message?: string): DayContent {
  let embedUrl: string | null = null;
  if (day.content_url && day.content_type === "youtube") {
    const id = youtubeId(day.content_url);
    if (id) embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
  }
  if (day.content_url && day.content_type === "vimeo") {
    const id = vimeoId(day.content_url);
    if (id) embedUrl = `https://player.vimeo.com/video/${id}?autoplay=1`;
  }
  return {
    type: day.content_type,
    url: day.content_url,
    embedUrl,
    text: day.content_text,
    label: day.label,
    number: dayNumber(day.date),
    animation: day.open_animation || cal.open_animation,
    message,
  };
}
