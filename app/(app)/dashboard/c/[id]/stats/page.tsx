import { StatsDashboard } from "@/components/stats/stats-dashboard";
import { StatsFilters } from "@/components/stats/stats-filters";
import { requireUser } from "@/lib/auth/session";
import { getManagedCalendar } from "@/lib/calendar/repo";
import { computeStats, periodToRange } from "@/lib/stats/compute";

export default async function CalendarStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const cal = await getManagedCalendar(id, user);
  const range = periodToRange(sp.period, sp.from, sp.to);
  const stats = await computeStats({ calendarIds: [id], ...range, timeZone: cal.timezone });
  const qs = new URLSearchParams({ calendar: id, ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) });
  return (
    <div className="space-y-6">
      <StatsFilters period={sp.period} from={range.from} to={range.to} exportHref={`/api/stats/export?${qs}`} />
      <StatsDashboard stats={stats} />
    </div>
  );
}
