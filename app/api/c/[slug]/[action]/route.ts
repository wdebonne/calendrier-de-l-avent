import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { Calendar, Day, DayEventsTable } from "@/lib/db/types";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { hashIp } from "@/lib/crypto";
import { isDayAvailable } from "@/lib/calendar/dates";
import {
  canManage,
  checkCalendarAccess,
  dayContent,
  getVisitorId,
  grantPasswordAccess,
  loadCalendarBySlug,
} from "@/lib/calendar/public";
import { verifyAnswer, type Challenge } from "@/lib/challenges";
import { checkBlocked, clientIpFromHeaders, ipDecision, rateLimit, recordAttempt } from "@/lib/security/guard";
import { getSetting } from "@/lib/settings";
import { newId, nowIso, safeJson } from "@/lib/utils";

type Body = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function logEvent(
  cal: Calendar,
  dayId: string,
  visitorId: string,
  type: DayEventsTable["type"],
  extra: { payload?: unknown; duration?: number | null } = {},
) {
  const db = await getDb();
  await db
    .insertInto("day_events")
    .values({
      id: newId(),
      calendar_id: cal.id,
      day_id: dayId,
      visitor_id: visitorId,
      type,
      payload: extra.payload === undefined ? null : JSON.stringify(extra.payload).slice(0, 2000),
      duration_ms:
        typeof extra.duration === "number" && Number.isFinite(extra.duration)
          ? Math.max(0, Math.min(Math.round(extra.duration), 86_400_000))
          : null,
      created_at: nowIso(),
    })
    .execute();
}

async function getDay(cal: Calendar, dayId: unknown): Promise<Day | null> {
  if (typeof dayId !== "string") return null;
  const db = await getDb();
  return (
    (await db.selectFrom("days").selectAll().where("id", "=", dayId).where("calendar_id", "=", cal.id).executeTakeFirst()) ??
    null
  );
}

async function hasSolved(cal: Calendar, dayId: string, visitorId: string) {
  const db = await getDb();
  return !!(await db
    .selectFrom("day_events")
    .select("id")
    .where("day_id", "=", dayId)
    .where("visitor_id", "=", visitorId)
    .where("type", "=", "solve")
    .executeTakeFirst());
}

async function failedAttempts(dayId: string, visitorId: string) {
  const db = await getDb();
  const r = await db
    .selectFrom("day_events")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("day_id", "=", dayId)
    .where("visitor_id", "=", visitorId)
    .where("type", "=", "fail")
    .executeTakeFirst();
  return Number(r?.n ?? 0);
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; action: string }> }) {
  const { slug, action } = await params;
  const ip = clientIpFromHeaders(request.headers);
  if ((await ipDecision(ip)) === "deny") return json({ error: "forbidden" }, 403);

  const cal = await loadCalendarBySlug(slug);
  if (!cal) return json({ error: "not_found" }, 404);
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Body;
  const user = await getCurrentUser();
  const manager = canManage(user, cal);
  const preview = manager && body.preview === true;

  // Password unlock is the only action allowed before access is granted.
  if (action === "unlock") {
    if (!cal.password_hash) return json({ ok: true });
    const security = await getSetting("security");
    const scope = `unlock:${cal.id}`;
    if (security.protectCalendars) {
      const block = await checkBlocked(scope, ip, null);
      if (block.blocked) return json({ error: "blocked", until: block.until }, 429);
    }
    const ok = await verifyPassword(cal.password_hash, String(body.password ?? ""));
    if (security.protectCalendars) await recordAttempt(scope, ip, null, ok);
    if (!ok) return json({ error: "wrong_password" }, 401);
    await grantPasswordAccess(cal);
    return json({ ok: true });
  }

  const access = await checkCalendarAccess(cal, { manager, preview });
  if (access !== "ok") return json({ error: access }, 403);
  const visitorId = (await getVisitorId(true))!;

  switch (action) {
    case "visit": {
      if (manager) return json({ ok: true, skipped: true });
      const source = body.source === "qr" ? "qr" : "direct";
      const db = await getDb();
      await db
        .insertInto("visits")
        .values({
          id: newId(),
          calendar_id: cal.id,
          visitor_id: visitorId,
          ip_hash: hashIp(ip),
          user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300),
          referrer: (typeof body.referrer === "string" ? body.referrer : "").slice(0, 300) || null,
          source,
          created_at: nowIso(),
        })
        .execute();
      return json({ ok: true });
    }

    case "open": {
      const day = await getDay(cal, body.dayId);
      if (!day) return json({ error: "not_found" }, 404);
      if (!preview && !isDayAvailable(day.date, cal)) {
        if (!manager) await logEvent(cal, day.id, visitorId, "locked");
        return json({ error: "locked", date: day.date }, 403);
      }
      const challenge = safeJson<Challenge | null>(day.challenge, null);
      if (challenge && !preview && !(await hasSolved(cal, day.id, visitorId))) {
        return json({ error: "challenge_required" }, 403);
      }
      if (!preview && !manager) await logEvent(cal, day.id, visitorId, "open");
      return json({ content: dayContent(cal, day) });
    }

    case "solve": {
      const day = await getDay(cal, body.dayId);
      if (!day) return json({ error: "not_found" }, 404);
      const challenge = safeJson<Challenge | null>(day.challenge, null);
      if (!challenge) return json({ error: "no_challenge" }, 400);
      if (!preview && !isDayAvailable(day.date, cal)) return json({ error: "locked", date: day.date }, 403);

      const security = await getSetting("security");
      if (
        security.enabled &&
        security.protectCalendars &&
        (await ipDecision(ip)) !== "allow" &&
        !rateLimit(`challenge:${ip}:${day.id}`, security.challengeMaxAttemptsPerMinute, 60_000)
      ) {
        return json({ error: "rate_limited" }, 429);
      }

      const track = !preview && !manager;
      const failures = await failedAttempts(day.id, visitorId);
      if (!preview && challenge.maxAttempts > 0 && failures >= challenge.maxAttempts) {
        return json({ correct: false, attemptsLeft: 0, message: challenge.failMessage ?? null });
      }

      const correct = verifyAnswer(challenge, body.answer);
      const duration = typeof body.durationMs === "number" ? body.durationMs : null;
      if (track) {
        await logEvent(cal, day.id, visitorId, "attempt", { payload: { correct }, duration });
      }
      if (!correct) {
        if (!preview) await logEvent(cal, day.id, visitorId, "fail", { duration });
        const left = challenge.maxAttempts > 0 ? Math.max(0, challenge.maxAttempts - failures - 1) : null;
        return json({ correct: false, attemptsLeft: preview ? null : left, message: left === 0 ? challenge.failMessage ?? null : null });
      }
      if (!preview) {
        await logEvent(cal, day.id, visitorId, "solve", {
          duration,
          payload: { attempts: failures + 1, hints: Number(body.hintsUsed) || 0 },
        });
      }
      if (track) await logEvent(cal, day.id, visitorId, "open");
      return json({ correct: true, content: dayContent(cal, day, challenge.successMessage) });
    }

    case "event": {
      if (manager) return json({ ok: true, skipped: true });
      const day = await getDay(cal, body.dayId);
      if (!day) return json({ error: "not_found" }, 404);
      const type = body.type === "hint" ? "hint" : body.type === "close" ? "close" : null;
      if (!type) return json({ error: "bad_type" }, 400);
      await logEvent(cal, day.id, visitorId, type, {
        payload: type === "hint" ? { index: Number(body.index) || 0 } : undefined,
        duration: typeof body.durationMs === "number" ? body.durationMs : null,
      });
      return json({ ok: true });
    }

    default:
      return json({ error: "unknown_action" }, 404);
  }
}
