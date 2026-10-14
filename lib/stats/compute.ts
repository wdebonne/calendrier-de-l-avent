import "server-only";
import { getDb } from "@/lib/db";
import { dayNumber } from "@/lib/calendar/dates";
import { safeJson } from "@/lib/utils";

export interface StatsFilter {
  calendarIds: string[];
  /** Inclusive YYYY-MM-DD bounds. */
  from?: string;
  to?: string;
  timeZone?: string;
}

export interface ChallengeRow {
  dayId: string;
  number: number;
  date: string;
  calendarTitle: string;
  type: string;
  title: string;
  attempts: number;
  solves: number;
  players: number;
  successRate: number | null;
  avgSolveMs: number | null;
  hints: number;
}

export interface StatsResult {
  totals: {
    visits: number;
    uniqueVisitors: number;
    opens: number;
    uniqueOpeners: number;
    solves: number;
    attempts: number;
    successRate: number | null;
    avgSolveMs: number | null;
    avgViewMs: number | null;
    hints: number;
    locked: number;
  };
  series: { date: string; visits: number; opens: number }[];
  sources: { source: string; count: number }[];
  byDoor: { label: string; date: string; opens: number; unique: number }[];
  byHour: number[];
  challenges: ChallengeRow[];
}

function localParts(iso: string, timeZone: string) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export async function computeStats(filter: StatsFilter): Promise<StatsResult> {
  const db = await getDb();
  const tz = filter.timeZone ?? "Europe/Paris";
  const empty: StatsResult = {
    totals: { visits: 0, uniqueVisitors: 0, opens: 0, uniqueOpeners: 0, solves: 0, attempts: 0, successRate: null, avgSolveMs: null, avgViewMs: null, hints: 0, locked: 0 },
    series: [],
    sources: [],
    byDoor: [],
    byHour: Array(24).fill(0),
    challenges: [],
  };
  if (!filter.calendarIds.length) return empty;

  // Small margin around the bounds; exact filtering happens on local dates below.
  const fromIso = filter.from ? new Date(`${filter.from}T00:00:00Z`).getTime() - 86_400_000 : null;
  const toIso = filter.to ? new Date(`${filter.to}T23:59:59Z`).getTime() + 86_400_000 : null;

  let vq = db.selectFrom("visits").select(["visitor_id", "source", "created_at"]).where("calendar_id", "in", filter.calendarIds);
  let eq = db
    .selectFrom("day_events")
    .select(["day_id", "visitor_id", "type", "payload", "duration_ms", "created_at"])
    .where("calendar_id", "in", filter.calendarIds);
  if (fromIso) {
    vq = vq.where("created_at", ">=", new Date(fromIso).toISOString());
    eq = eq.where("created_at", ">=", new Date(fromIso).toISOString());
  }
  if (toIso) {
    vq = vq.where("created_at", "<=", new Date(toIso).toISOString());
    eq = eq.where("created_at", "<=", new Date(toIso).toISOString());
  }
  const [visitsRaw, eventsRaw, days] = await Promise.all([
    vq.execute(),
    eq.execute(),
    db
      .selectFrom("days")
      .innerJoin("calendars", "calendars.id", "days.calendar_id")
      .select(["days.id", "days.date", "days.challenge", "calendars.title as calendar_title"])
      .where("days.calendar_id", "in", filter.calendarIds)
      .orderBy("days.date")
      .execute(),
  ]);

  const inRange = (date: string) => (!filter.from || date >= filter.from) && (!filter.to || date <= filter.to);
  const visits = visitsRaw.map((v) => ({ ...v, ...localParts(v.created_at, tz) })).filter((v) => inRange(v.date));
  const events = eventsRaw.map((e) => ({ ...e, ...localParts(e.created_at, tz) })).filter((e) => inRange(e.date));

  const series = new Map<string, { visits: number; opens: number }>();
  const bump = (date: string, key: "visits" | "opens") => {
    const s = series.get(date) ?? { visits: 0, opens: 0 };
    s[key]++;
    series.set(date, s);
  };
  const byHour = Array(24).fill(0) as number[];
  const sources = new Map<string, number>();
  for (const v of visits) {
    bump(v.date, "visits");
    byHour[v.hour]++;
    sources.set(v.source, (sources.get(v.source) ?? 0) + 1);
  }

  const opensByDay = new Map<string, { opens: number; visitors: Set<string> }>();
  const solveDurations: number[] = [];
  const viewDurations: number[] = [];
  let attempts = 0;
  let solves = 0;
  let hints = 0;
  let locked = 0;
  const openers = new Set<string>();
  const perChallenge = new Map<string, { attempts: number; solves: number; players: Set<string>; durations: number[]; hints: number }>();
  const pc = (dayId: string) => {
    let c = perChallenge.get(dayId);
    if (!c) {
      c = { attempts: 0, solves: 0, players: new Set(), durations: [], hints: 0 };
      perChallenge.set(dayId, c);
    }
    return c;
  };

  for (const e of events) {
    switch (e.type) {
      case "open": {
        bump(e.date, "opens");
        byHour[e.hour]++;
        openers.add(e.visitor_id);
        const o = opensByDay.get(e.day_id) ?? { opens: 0, visitors: new Set<string>() };
        o.opens++;
        o.visitors.add(e.visitor_id);
        opensByDay.set(e.day_id, o);
        break;
      }
      case "attempt":
        attempts++;
        pc(e.day_id).attempts++;
        pc(e.day_id).players.add(e.visitor_id);
        break;
      case "solve":
        solves++;
        pc(e.day_id).solves++;
        if (e.duration_ms != null) {
          solveDurations.push(e.duration_ms);
          pc(e.day_id).durations.push(e.duration_ms);
        }
        break;
      case "hint":
        hints++;
        pc(e.day_id).hints++;
        break;
      case "close":
        if (e.duration_ms != null && e.duration_ms > 500) viewDurations.push(e.duration_ms);
        break;
      case "locked":
        locked++;
        break;
    }
  }

  // Fill gaps in the time series so the line chart has a continuous x axis.
  const dates = [...series.keys()].sort();
  const filled: StatsResult["series"] = [];
  if (dates.length) {
    const start = filter.from && filter.from > dates[0] ? dates[0] : (filter.from ?? dates[0]);
    const end = filter.to && filter.to < dates[dates.length - 1] ? dates[dates.length - 1] : (filter.to ?? dates[dates.length - 1]);
    const cur = new Date(`${start}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    while (cur <= last && filled.length < 400) {
      const key = cur.toISOString().slice(0, 10);
      filled.push({ date: key, ...(series.get(key) ?? { visits: 0, opens: 0 }) });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  const multi = filter.calendarIds.length > 1;
  const byDoor = days.map((d) => ({
    label: String(dayNumber(d.date)),
    date: d.date,
    opens: opensByDay.get(d.id)?.opens ?? 0,
    unique: opensByDay.get(d.id)?.visitors.size ?? 0,
  }));

  const challenges: ChallengeRow[] = days
    .filter((d) => d.challenge)
    .map((d) => {
      const ch = safeJson<{ type: string; title?: string }>(d.challenge, { type: "?" });
      const c = perChallenge.get(d.id);
      return {
        dayId: d.id,
        number: dayNumber(d.date),
        date: d.date,
        calendarTitle: d.calendar_title,
        type: ch.type,
        title: ch.title ?? "",
        attempts: c?.attempts ?? 0,
        solves: c?.solves ?? 0,
        players: c?.players.size ?? 0,
        successRate: c && c.players.size ? Math.min(1, c.solves / c.players.size) : null,
        avgSolveMs: avg(c?.durations ?? []),
        hints: c?.hints ?? 0,
      };
    });

  const totalPlayers = [...perChallenge.values()].reduce((a, c) => a + c.players.size, 0);
  return {
    totals: {
      visits: visits.length,
      uniqueVisitors: new Set(visits.map((v) => v.visitor_id)).size,
      opens: events.filter((e) => e.type === "open").length,
      uniqueOpeners: openers.size,
      solves,
      attempts,
      successRate: totalPlayers ? Math.min(1, solves / totalPlayers) : null,
      avgSolveMs: avg(solveDurations),
      avgViewMs: avg(viewDurations),
      hints,
      locked,
    },
    series: filled,
    sources: [...sources.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    byDoor: multi ? [] : byDoor,
    byHour,
    challenges,
  };
}

export function periodToRange(period: string | undefined, from?: string, to?: string): { from?: string; to?: string } {
  const today = new Date().toISOString().slice(0, 10);
  const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  switch (period) {
    case "7":
      return { from: ago(6), to: today };
    case "30":
      return { from: ago(29), to: today };
    case "custom":
      return {
        from: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined,
        to: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : undefined,
      };
    default:
      return {};
  }
}
