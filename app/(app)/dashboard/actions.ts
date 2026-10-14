"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { dateRange, isValidDate } from "@/lib/calendar/dates";
import {
  createCalendar,
  duplicateCalendar,
  generateUniqueSlug,
  getManagedCalendar,
  isSlugTaken,
  syncDays,
} from "@/lib/calendar/repo";
import { DOOR_ANIMATIONS, normalizeTheme, OPEN_ANIMATIONS, TIMEZONES } from "@/lib/calendar/theme";
import { parseChallenge } from "@/lib/challenges";
import { nowIso, SLUG_RE } from "@/lib/utils";

export type ActionState = { error?: string; success?: string; field?: string } | undefined;

function str(form: FormData, key: string, max = 500) {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

async function validateCommon(form: FormData, calendarId?: string) {
  const t = await getTranslations("calendar");
  const title = str(form, "title", 120);
  const slug = str(form, "slug", 60).toLowerCase();
  const start = str(form, "start_date", 10);
  const end = str(form, "end_date", 10);
  let timezone = str(form, "timezone", 60);
  if (!title) return { error: t("title"), field: "title" } as const;
  if (!SLUG_RE.test(slug) || slug.length < 3) return { error: t("slugInvalid"), field: "slug" } as const;
  if (await isSlugTaken(slug, calendarId)) return { error: t("slugTaken"), field: "slug" } as const;
  if (!isValidDate(start) || !isValidDate(end) || start > end || dateRange(start, end).length > 366 || dateRange(start, end).length === 0)
    return { error: t("rangeInvalid"), field: "start_date" } as const;
  if (!TIMEZONES.includes(timezone)) timezone = "Europe/Paris";
  return { title, slug, start, end, timezone };
}

export async function createCalendarAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const v = await validateCommon(form);
  if ("error" in v) return { error: v.error, field: v.field };
  const id = await createCalendar(user, {
    title: v.title,
    slug: v.slug,
    start: v.start,
    end: v.end,
    timezone: v.timezone,
    description: str(form, "description", 1000) || null,
  });
  redirect(`/dashboard/c/${id}/days?created=1`);
}

export async function updateSettingsAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const cal = await getManagedCalendar(id, user);
  const v = await validateCommon(form, id);
  if ("error" in v) return { error: v.error, field: v.field };
  const tc = await getTranslations("common");

  let password_hash = cal.password_hash;
  const password = String(form.get("password") ?? "");
  if (form.get("remove_password") === "on") password_hash = null;
  else if (password) password_hash = await hashPassword(password);

  const db = await getDb();
  await db
    .updateTable("calendars")
    .set({
      title: v.title,
      slug: v.slug,
      description: str(form, "description", 1000) || null,
      start_date: v.start,
      end_date: v.end,
      timezone: v.timezone,
      unlock_mode: form.get("unlock_mode") === "all" ? "all" : "date",
      published: form.get("published") === "on" ? 1 : 0,
      password_hash,
      updated_at: nowIso(),
    })
    .where("id", "=", id)
    .execute();
  if (v.start !== cal.start_date || v.end !== cal.end_date) await syncDays(id, v.start, v.end);
  revalidatePath(`/dashboard/c/${id}`, "layout");
  return { success: tc("saved") };
}

export async function updateAppearanceAction(
  id: string,
  payload: { theme: unknown; door_animation: string; open_animation: string },
): Promise<ActionState> {
  const user = await requireUser();
  await getManagedCalendar(id, user);
  const theme = normalizeTheme(payload.theme);
  const db = await getDb();
  await db
    .updateTable("calendars")
    .set({
      theme: JSON.stringify(theme),
      door_animation: (DOOR_ANIMATIONS as readonly string[]).includes(payload.door_animation) ? payload.door_animation : "swing",
      open_animation: (OPEN_ANIMATIONS as readonly string[]).includes(payload.open_animation) ? payload.open_animation : "confetti",
      updated_at: nowIso(),
    })
    .where("id", "=", id)
    .execute();
  revalidatePath(`/dashboard/c/${id}`, "layout");
  return { success: (await getTranslations("common"))("saved") };
}

const CONTENT_TYPES = ["image", "video", "youtube", "vimeo", "link", "text"] as const;

function isSafeUrl(url: string) {
  if (url.startsWith("/api/media/")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export interface DayPayload {
  label: string;
  cover_url: string;
  content_type: string;
  content_url: string;
  content_text: string;
  open_animation: string;
  challenge: unknown | null;
}

export async function saveDayAction(dayId: string, payload: DayPayload): Promise<ActionState> {
  const user = await requireUser();
  const t = await getTranslations("days");
  const db = await getDb();
  const day = await db.selectFrom("days").select(["id", "calendar_id"]).where("id", "=", dayId).executeTakeFirst();
  if (!day) return { error: "404" };
  await getManagedCalendar(day.calendar_id, user);

  const contentType = (CONTENT_TYPES as readonly string[]).includes(payload.content_type) ? payload.content_type : "image";
  const contentUrl = String(payload.content_url ?? "").trim().slice(0, 2000);
  const coverUrl = String(payload.cover_url ?? "").trim().slice(0, 2000);
  if (contentUrl && !isSafeUrl(contentUrl)) return { error: t("invalidUrl"), field: "content_url" };
  if (coverUrl && !isSafeUrl(coverUrl)) return { error: t("invalidUrl"), field: "cover_url" };

  let challenge: string | null = null;
  if (payload.challenge) {
    const parsed = parseChallenge(payload.challenge);
    if (!parsed) return { error: t("invalidChallenge"), field: "challenge" };
    challenge = JSON.stringify(parsed);
  }
  const anim = String(payload.open_animation ?? "");
  await db
    .updateTable("days")
    .set({
      label: String(payload.label ?? "").trim().slice(0, 200) || null,
      cover_url: coverUrl || null,
      content_type: contentType as (typeof CONTENT_TYPES)[number],
      content_url: contentType === "text" ? null : contentUrl || null,
      content_text: String(payload.content_text ?? "").slice(0, 5000) || null,
      open_animation: (OPEN_ANIMATIONS as readonly string[]).includes(anim) ? anim : null,
      challenge,
      updated_at: nowIso(),
    })
    .where("id", "=", dayId)
    .execute();
  await db.updateTable("calendars").set({ updated_at: nowIso() }).where("id", "=", day.calendar_id).execute();
  revalidatePath(`/dashboard/c/${day.calendar_id}/days`);
  return { success: t("savedDay") };
}

export async function applyAnimationToAllAction(calendarId: string, animation: string | null): Promise<ActionState> {
  const user = await requireUser();
  await getManagedCalendar(calendarId, user);
  const db = await getDb();
  const value = animation && (OPEN_ANIMATIONS as readonly string[]).includes(animation) ? animation : null;
  await db.updateTable("days").set({ open_animation: value }).where("calendar_id", "=", calendarId).execute();
  revalidatePath(`/dashboard/c/${calendarId}/days`);
  return { success: (await getTranslations("common"))("saved") };
}

export async function saveQrConfigAction(calendarId: string, config: unknown): Promise<ActionState> {
  const user = await requireUser();
  await getManagedCalendar(calendarId, user);
  const json = JSON.stringify(config ?? {});
  if (json.length > 20_000) return { error: "too large" };
  const db = await getDb();
  await db.updateTable("calendars").set({ qr_config: json }).where("id", "=", calendarId).execute();
  return { success: (await getTranslations("common"))("saved") };
}

export async function duplicateCalendarAction(calendarId: string) {
  const user = await requireUser();
  const cal = await getManagedCalendar(calendarId, user);
  const id = await duplicateCalendar(cal, user);
  revalidatePath("/dashboard");
  redirect(`/dashboard/c/${id}/settings`);
}

export async function deleteCalendarAction(calendarId: string) {
  const user = await requireUser();
  await getManagedCalendar(calendarId, user);
  const db = await getDb();
  // Explicit order so it also works if foreign keys are not enforced.
  await db.deleteFrom("day_events").where("calendar_id", "=", calendarId).execute();
  await db.deleteFrom("visits").where("calendar_id", "=", calendarId).execute();
  await db.deleteFrom("days").where("calendar_id", "=", calendarId).execute();
  await db.deleteFrom("calendars").where("id", "=", calendarId).execute();
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function newSlugAction(): Promise<string> {
  await requireUser();
  return generateUniqueSlug();
}
