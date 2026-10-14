import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { StatsDashboard } from "@/components/stats/stats-dashboard";
import { StatsFilters } from "@/components/stats/stats-filters";
import { requireAdmin } from "@/lib/auth/session";
import { listCalendars } from "@/lib/calendar/repo";
import { computeStats, periodToRange } from "@/lib/stats/compute";

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; calendar?: string }>;
}) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const t = await getTranslations("stats");
  const td = await getTranslations("dashboard");
  const calendars = await listCalendars(user, {});
  const selected = calendars.find((c) => c.id === sp.calendar);
  const range = periodToRange(sp.period, sp.from, sp.to);
  const stats = await computeStats({
    calendarIds: selected ? [selected.id] : calendars.map((c) => c.id),
    ...range,
    timeZone: selected?.timezone,
  });
  const qs = new URLSearchParams({
    ...(selected ? { calendar: selected.id } : {}),
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
  });
  const top = [...calendars].sort((a, b) => b.visit_count - a.visit_count).slice(0, 10);

  return (
    <>
      <PageHeader title={t("globalTitle")} />
      <div className="space-y-6">
        <StatsFilters
          period={sp.period}
          from={range.from}
          to={range.to}
          exportHref={`/api/stats/export?${qs}`}
          calendars={calendars.map((c) => ({ id: c.id, title: c.title }))}
          calendarId={selected?.id}
        />
        <StatsDashboard stats={stats} showDoors={!!selected} />
        {!selected && top.length > 0 && (
          <Card className="overflow-hidden">
            <CardHeader title={t("topCalendars")} />
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">{t("calendar")}</th>
                  <th className="px-4 py-2.5">{td("owner")}</th>
                  <th className="px-4 py-2.5 text-right">{t("visits")}</th>
                  <th className="px-4 py-2.5 text-right">{t("opens")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {top.map((c) => (
                  <tr key={c.id} className="hover:bg-stone-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/c/${c.id}/stats`} className="font-medium hover:text-brand-700">
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{c.owner_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.visit_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.open_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}
