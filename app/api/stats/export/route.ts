import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { dayNumber } from "@/lib/calendar/dates";

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const calendarId = url.searchParams.get("calendar");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const db = await getDb();

  let calQuery = db.selectFrom("calendars").select(["id", "title", "owner_id"]);
  if (calendarId) calQuery = calQuery.where("id", "=", calendarId);
  if (user.role !== "admin") calQuery = calQuery.where("owner_id", "=", user.id);
  const calendars = await calQuery.execute();
  if (calendarId && !calendars.length) return new Response("Not found", { status: 404 });
  const ids = calendars.map((c) => c.id);
  const titles = new Map(calendars.map((c) => [c.id, c.title]));

  const rows: string[][] = [["timestamp", "calendar", "day", "event", "visitor", "duration_ms", "details"]];
  if (ids.length) {
    let vq = db.selectFrom("visits").select(["calendar_id", "visitor_id", "source", "created_at"]).where("calendar_id", "in", ids);
    let eq = db
      .selectFrom("day_events")
      .innerJoin("days", "days.id", "day_events.day_id")
      .select([
        "day_events.calendar_id",
        "day_events.visitor_id",
        "day_events.type",
        "day_events.payload",
        "day_events.duration_ms",
        "day_events.created_at",
        "days.date",
      ])
      .where("day_events.calendar_id", "in", ids);
    if (from) {
      vq = vq.where("created_at", ">=", `${from}T00:00:00`);
      eq = eq.where("day_events.created_at", ">=", `${from}T00:00:00`);
    }
    if (to) {
      vq = vq.where("created_at", "<=", `${to}T23:59:59.999Z`);
      eq = eq.where("day_events.created_at", "<=", `${to}T23:59:59.999Z`);
    }
    const [visits, events] = await Promise.all([vq.execute(), eq.execute()]);
    const all = [
      ...visits.map((v) => [v.created_at, titles.get(v.calendar_id) ?? "", "", "visit", v.visitor_id, "", `source=${v.source}`]),
      ...events.map((e) => [
        e.created_at,
        titles.get(e.calendar_id) ?? "",
        String(dayNumber(e.date)),
        e.type,
        e.visitor_id,
        e.duration_ms == null ? "" : String(e.duration_ms),
        e.payload ?? "",
      ]),
    ].sort((a, b) => a[0].localeCompare(b[0]));
    rows.push(...all);
  }

  // BOM so Excel opens UTF-8 correctly.
  const body = "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stats-${calendarId ?? "all"}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
