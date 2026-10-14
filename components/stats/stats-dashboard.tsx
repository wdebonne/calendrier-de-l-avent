"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clock, Eye, Gift, Lightbulb, Lock, Puzzle, Target } from "lucide-react";
import { Card, CardHeader, StatTile } from "@/components/ui";
import type { StatsResult } from "@/lib/stats/compute";

// Validated categorical slots (dataviz reference palette, light surface).
const SERIES_1 = "#2a78d6";
const SERIES_2 = "#eb6834";
// Sequential blue ramp for the hour heatmap (lightest = near zero).
const RAMP = ["#f0efec", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

const AXIS = { fontSize: 11, fill: "#78716c" };

function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  labelFormatter?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lift">
      <div className="mb-1 font-semibold text-ink">{labelFormatter ? labelFormatter(String(label)) : label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-stone-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}
          <span className="ml-auto pl-3 font-semibold tabular-nums text-ink">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function StatsDashboard({ stats, showDoors = true }: { stats: StatsResult; showDoors?: boolean }) {
  const t = useTranslations("stats");
  const tch = useTranslations("challenge.types");
  const format = useFormatter();
  const s = stats.totals;
  const seconds = (ms: number | null) => (ms == null ? "—" : t("seconds", { value: Math.round(ms / 100) / 10 }));
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)} %`);
  const shortDate = (d: string) => format.dateTime(new Date(`${d}T12:00:00`), { day: "numeric", month: "short" });
  const totalSources = stats.sources.reduce((a, b) => a + b.count, 0);
  const maxHour = Math.max(1, ...stats.byHour);
  const hasData = s.visits + s.opens + s.attempts > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t("visits")} value={s.visits} sub={`${s.uniqueVisitors} ${t("uniqueVisitors").toLowerCase()}`} icon={<Eye className="h-4 w-4" />} />
        <StatTile label={t("opens")} value={s.opens} icon={<Gift className="h-4 w-4" />} />
        <StatTile label={t("avgViewTime")} value={seconds(s.avgViewMs)} icon={<Clock className="h-4 w-4" />} />
        <StatTile label={t("lockedClicks")} value={s.locked} icon={<Lock className="h-4 w-4" />} />
        <StatTile label={t("solves")} value={s.solves} sub={`${s.attempts} ${t("attempts").toLowerCase()}`} icon={<Puzzle className="h-4 w-4" />} />
        <StatTile label={t("successRate")} value={pct(s.successRate)} icon={<Target className="h-4 w-4" />} />
        <StatTile label={t("avgSolveTime")} value={seconds(s.avgSolveMs)} icon={<Clock className="h-4 w-4" />} />
        <StatTile label={t("hintsUsed")} value={s.hints} icon={<Lightbulb className="h-4 w-4" />} />
      </div>

      {!hasData ? (
        <Card className="p-10 text-center text-sm text-muted">📭 {t("noData")}</Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title={t("visitsOverTime")}
              action={
                <div className="flex gap-4 text-xs text-stone-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded" style={{ background: SERIES_1 }} /> {t("visits")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded" style={{ background: SERIES_2 }} /> {t("opens")}
                  </span>
                </div>
              }
            />
            <div className="h-64 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip labelFormatter={shortDate} />} cursor={{ stroke: "#a8a29e", strokeDasharray: "3 3" }} />
                  <Line type="monotone" dataKey="visits" name={t("visits")} stroke={SERIES_1} strokeWidth={2} dot={stats.series.length <= 3 ? { r: 4 } : false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                  <Line type="monotone" dataKey="opens" name={t("opens")} stroke={SERIES_2} strokeWidth={2} dot={stats.series.length <= 3 ? { r: 4 } : false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title={t("bySource")} />
              <div className="space-y-3 p-5">
                {stats.sources.length === 0 && <p className="text-sm text-muted">—</p>}
                {stats.sources.map((src) => {
                  const share = totalSources ? src.count / totalSources : 0;
                  const label = src.source === "qr" ? t("sources.qr") : src.source === "direct" ? t("sources.direct") : t("sources.other");
                  return (
                    <div key={src.source} title={`${label}: ${src.count}`}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-medium">{src.source === "qr" ? "📱" : "🔗"} {label}</span>
                        <span className="tabular-nums text-stone-600">
                          {src.count} · {Math.round(share * 100)} %
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: SERIES_1 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <CardHeader title={t("byHour")} />
              <div className="p-5">
                <div className="grid grid-cols-12 gap-1">
                  {stats.byHour.map((v, h) => {
                    const idx = v === 0 ? 0 : 1 + Math.min(RAMP.length - 2, Math.floor((v / maxHour) * (RAMP.length - 1)));
                    return (
                      <div key={h} className="group relative">
                        <div className="aspect-square rounded-md" style={{ background: RAMP[idx] }} />
                        <div className="mt-0.5 text-center text-[10px] text-muted">{h}h</div>
                        <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] text-white group-hover:block">
                          {h}h–{h + 1}h : {v}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted">
                  0
                  {RAMP.map((c) => (
                    <span key={c} className="h-2.5 w-4 rounded-sm" style={{ background: c }} />
                  ))}
                  {maxHour}
                </div>
              </div>
            </Card>
          </div>

          {showDoors && stats.byDoor.length > 0 && (
            <Card>
              <CardHeader title={t("byDoor")} />
              <div className="h-60 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.byDoor} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
                    <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                    <Tooltip
                      content={<ChartTooltip labelFormatter={(l) => `${t("day")} ${l}`} />}
                      cursor={{ fill: "#f5f5f4" }}
                    />
                    <Bar dataKey="opens" name={t("opens")} fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </>
      )}

      {stats.challenges.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title={t("challengeTable")} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">{t("day")}</th>
                  <th className="px-4 py-2.5">{t("type")}</th>
                  <th className="px-4 py-2.5 text-right">{t("attempts")}</th>
                  <th className="px-4 py-2.5 text-right">{t("solves")}</th>
                  <th className="px-4 py-2.5 text-right">{t("successRate")}</th>
                  <th className="px-4 py-2.5 text-right">{t("avgSolveTime")}</th>
                  <th className="px-4 py-2.5 text-right">{t("hintsUsed")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {stats.challenges.map((c) => (
                  <tr key={c.dayId} className="hover:bg-stone-50">
                    <td className="px-4 py-2.5 font-semibold">
                      {c.number}
                      {!showDoors && <span className="ml-2 font-normal text-muted">{c.calendarTitle}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {tch(c.type as "riddle")}
                      {c.title && <span className="ml-1 text-muted">· {c.title}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.attempts}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.solves}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pct(c.successRate)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{seconds(c.avgSolveMs)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.hints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
