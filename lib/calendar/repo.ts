import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import type { Calendar, Day, User } from "@/lib/db/types";
import { getSetting } from "@/lib/settings";
import { newId, nowIso, randomNumericSlug } from "@/lib/utils";
import { dateRange } from "./dates";
import { DEFAULT_THEME } from "./theme";

export async function isSlugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const db = await getDb();
  let q = db.selectFrom("calendars").select("id").where("slug", "=", slug);
  if (exceptId) q = q.where("id", "!=", exceptId);
  return !!(await q.executeTakeFirst());
}

export async function generateUniqueSlug(): Promise<string> {
  const { slugLength } = await getSetting("general");
  for (let i = 0; i < 20; i++) {
    const slug = randomNumericSlug(Math.max(6, Math.min(20, slugLength)));
    if (!(await isSlugTaken(slug))) return slug;
  }
  throw new Error("Unable to generate a unique slug");
}

/** Loads a calendar the user may manage (owner or admin), or 404. */
export async function getManagedCalendar(id: string, user: User): Promise<Calendar> {
  const db = await getDb();
  const cal = await db.selectFrom("calendars").selectAll().where("id", "=", id).executeTakeFirst();
  if (!cal || (user.role !== "admin" && cal.owner_id !== user.id)) notFound();
  return cal;
}

export async function getCalendarDays(calendarId: string): Promise<Day[]> {
  const db = await getDb();
  return db.selectFrom("days").selectAll().where("calendar_id", "=", calendarId).orderBy("date").execute();
}

/**
 * Makes the days match the date range: missing dates are created empty, dates outside the
 * range are removed, and the content of kept dates is preserved.
 */
export async function syncDays(calendarId: string, start: string, end: string) {
  const db = await getDb();
  const dates = dateRange(start, end);
  const existing = await db.selectFrom("days").select(["id", "date"]).where("calendar_id", "=", calendarId).execute();
  const existingDates = new Set(existing.map((d) => d.date));
  const wanted = new Set(dates);
  const toDelete = existing.filter((d) => !wanted.has(d.date)).map((d) => d.id);
  if (toDelete.length) await db.deleteFrom("days").where("id", "in", toDelete).execute();
  const now = nowIso();
  const toInsert = dates
    .filter((d) => !existingDates.has(d))
    .map((date) => ({
      id: newId(),
      calendar_id: calendarId,
      date,
      position: 0,
      label: null,
      cover_url: null,
      content_type: "image" as const,
      content_url: null,
      content_text: null,
      open_animation: null,
      challenge: null,
      created_at: now,
      updated_at: now,
    }));
  for (let i = 0; i < toInsert.length; i += 100) {
    await db.insertInto("days").values(toInsert.slice(i, i + 100)).execute();
  }
  // Positions follow chronological order (the "shuffle" layout is applied at display time).
  const all = await db.selectFrom("days").select(["id", "date"]).where("calendar_id", "=", calendarId).orderBy("date").execute();
  for (const [i, d] of all.entries()) {
    await db.updateTable("days").set({ position: i + 1 }).where("id", "=", d.id).execute();
  }
}

export async function createCalendar(
  owner: User,
  input: { title: string; slug: string; start: string; end: string; timezone: string; description?: string | null },
): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();
  await db
    .insertInto("calendars")
    .values({
      id,
      owner_id: owner.id,
      title: input.title,
      description: input.description ?? null,
      slug: input.slug,
      start_date: input.start,
      end_date: input.end,
      timezone: input.timezone,
      theme: JSON.stringify(DEFAULT_THEME),
      door_animation: "swing",
      open_animation: "confetti",
      unlock_mode: "date",
      password_hash: null,
      published: 0,
      qr_config: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  await syncDays(id, input.start, input.end);
  return id;
}

export async function duplicateCalendar(source: Calendar, owner: User): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();
  await db
    .insertInto("calendars")
    .values({
      ...source,
      id,
      owner_id: owner.id,
      title: `${source.title} (copie)`,
      slug: await generateUniqueSlug(),
      published: 0,
      created_at: now,
      updated_at: now,
    })
    .execute();
  const days = await getCalendarDays(source.id);
  if (days.length) {
    await db
      .insertInto("days")
      .values(days.map((d) => ({ ...d, id: newId(), calendar_id: id, created_at: now, updated_at: now })))
      .execute();
  }
  return id;
}

export interface CalendarListItem extends Calendar {
  owner_name: string;
  day_count: number;
  filled_count: number;
  visit_count: number;
  open_count: number;
}

export async function listCalendars(
  user: User,
  filters: { q?: string; status?: string; owner?: string; sort?: string },
): Promise<CalendarListItem[]> {
  const db = await getDb();
  let q = db
    .selectFrom("calendars")
    .innerJoin("users", "users.id", "calendars.owner_id")
    .selectAll("calendars")
    .select("users.name as owner_name");
  if (user.role !== "admin") q = q.where("calendars.owner_id", "=", user.id);
  else if (filters.owner) q = q.where("calendars.owner_id", "=", filters.owner);
  if (filters.status === "published") q = q.where("calendars.published", "=", 1);
  if (filters.status === "draft") q = q.where("calendars.published", "=", 0);
  if (filters.q) {
    const term = `%${filters.q.toLowerCase()}%`;
    q = q.where((eb) =>
      eb.or([eb(eb.fn("lower", ["calendars.title"]), "like", term), eb("calendars.slug", "like", term)]),
    );
  }
  if (filters.sort === "title") q = q.orderBy("calendars.title");
  else if (filters.sort === "start") q = q.orderBy("calendars.start_date", "desc");
  else q = q.orderBy("calendars.updated_at", "desc");
  const rows = await q.execute();
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const [days, visits, opens] = await Promise.all([
    db
      .selectFrom("days")
      .select(["calendar_id", "content_url", "content_text", "challenge"])
      .where("calendar_id", "in", ids)
      .execute(),
    db
      .selectFrom("visits")
      .select(["calendar_id", (eb) => eb.fn.countAll<number>().as("n")])
      .where("calendar_id", "in", ids)
      .groupBy("calendar_id")
      .execute(),
    db
      .selectFrom("day_events")
      .select(["calendar_id", (eb) => eb.fn.countAll<number>().as("n")])
      .where("calendar_id", "in", ids)
      .where("type", "=", "open")
      .groupBy("calendar_id")
      .execute(),
  ]);
  const dayCount = new Map<string, number>();
  const filledCount = new Map<string, number>();
  for (const d of days) {
    dayCount.set(d.calendar_id, (dayCount.get(d.calendar_id) ?? 0) + 1);
    if (d.content_url || d.content_text) filledCount.set(d.calendar_id, (filledCount.get(d.calendar_id) ?? 0) + 1);
  }
  const visitMap = new Map(visits.map((v) => [v.calendar_id, Number(v.n)]));
  const openMap = new Map(opens.map((v) => [v.calendar_id, Number(v.n)]));
  return rows.map((r) => ({
    ...r,
    day_count: dayCount.get(r.id) ?? 0,
    filled_count: filledCount.get(r.id) ?? 0,
    visit_count: visitMap.get(r.id) ?? 0,
    open_count: openMap.get(r.id) ?? 0,
  }));
}

export function isDayFilled(d: Pick<Day, "content_url" | "content_text">) {
  return !!(d.content_url || d.content_text);
}
