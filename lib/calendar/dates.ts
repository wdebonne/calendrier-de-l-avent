// Pure date helpers. Dates are handled as "YYYY-MM-DD" strings in the calendar's time zone.

export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** A day can be opened once its date has started in the calendar's time zone (or always in "all" mode). */
export function isDayAvailable(
  dayDate: string,
  calendar: { timezone: string; unlock_mode: "date" | "all" },
  now: Date = new Date(),
): boolean {
  if (calendar.unlock_mode === "all") return true;
  return todayInTimeZone(calendar.timezone, now) >= dayDate;
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Inclusive list of dates between start and end (max 366 days). */
export function dateRange(start: string, end: string): string[] {
  if (!isValidDate(start) || !isValidDate(end) || start > end) return [];
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last && out.length < 366) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Default advent range: December 1st → 24th of the current season. */
export function defaultAdventRange(now: Date = new Date()): { start: string; end: string } {
  // After Christmas, prepare next year's calendar.
  const year = now.getUTCMonth() === 11 && now.getUTCDate() > 25 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return { start: `${year}-12-01`, end: `${year}-12-24` };
}

export function dayNumber(date: string): number {
  return Number(date.slice(8, 10));
}
