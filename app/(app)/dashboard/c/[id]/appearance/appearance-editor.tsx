"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Play, Save } from "lucide-react";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Toggle } from "@/components/ui";
import { MediaInput } from "@/components/media-input";
import { CalendarView } from "@/components/calendar/calendar-view";
import { playEffect } from "@/components/calendar/effects";
import { dateRange, dayNumber } from "@/lib/calendar/dates";
import type { PublicDay } from "@/lib/calendar/public";
import { DOOR_ANIMATIONS, OPEN_ANIMATIONS, THEME_PRESETS, type CalendarTheme } from "@/lib/calendar/theme";
import { cn } from "@/lib/utils";
import { updateAppearanceAction } from "../../../actions";

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white p-1"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      </div>
    </Field>
  );
}

export function AppearanceEditor({
  calendarId,
  slug,
  title,
  description,
  startDate,
  endDate,
  initialTheme,
  initialDoor,
  initialOpen,
}: {
  calendarId: string;
  slug: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  initialTheme: CalendarTheme;
  initialDoor: string;
  initialOpen: string;
}) {
  const t = useTranslations("appearance");
  const tc = useTranslations("common");
  const [theme, setTheme] = useState(initialTheme);
  const [door, setDoor] = useState(initialDoor);
  const [open, setOpen] = useState(initialOpen);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<CalendarTheme>) => {
    setTheme((th) => ({ ...th, ...patch }));
    setStatus(null);
  };

  // Sample doors for the live preview (first ones are "available" so clicks animate).
  const sampleDays: PublicDay[] = useMemo(
    () =>
      dateRange(startDate, endDate)
        .slice(0, 24)
        .map((date, i) => ({
          id: `demo-${date}`,
          date,
          number: dayNumber(date),
          label: null,
          cover_url: null,
          available: true,
          hasContent: true,
          challenge: null,
          solved: false,
          attemptsUsed: i,
        })),
    [startDate, endDate],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[24rem_1fr]">
      <div className="space-y-5">
        <Card>
          <CardHeader title={t("preset")} />
          <div className="grid grid-cols-3 gap-2 p-4">
            {Object.entries(THEME_PRESETS).map(([key, p]) => (
              <button
                key={key}
                type="button"
                onClick={() => set({ ...p, preset: key })}
                className={cn(
                  "overflow-hidden rounded-xl border-2 text-left transition hover:-translate-y-0.5",
                  theme.preset === key ? "border-brand-500 ring-4 ring-brand-100" : "border-transparent",
                )}
              >
                <div className="flex h-14 items-center justify-center gap-1" style={{ background: p.background }}>
                  {[1, 2, 3].map((n) => (
                    <span key={n} className="grid h-6 w-6 place-items-center rounded text-[10px] font-bold" style={{ background: p.door, color: p.doorText }}>
                      {n}
                    </span>
                  ))}
                </div>
                <div className="bg-white px-2 py-1 text-xs font-medium">{t(`presets.${key as keyof typeof THEME_PRESETS & "christmas"}`)}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <Field label={t("background")}>
            <Input value={theme.background} onChange={(e) => set({ background: e.target.value })} className="font-mono text-xs" />
          </Field>
          <Field label={t("backgroundImage")}>
            <MediaInput value={theme.backgroundImage ?? ""} onChange={(v) => set({ backgroundImage: v || null })} />
          </Field>
          {theme.backgroundImage && (
            <Field label={`${t("overlay")} (${Math.round(theme.overlay * 100)} %)`}>
              <input
                type="range"
                min={0}
                max={0.8}
                step={0.05}
                value={theme.overlay}
                onChange={(e) => set({ overlay: Number(e.target.value) })}
                className="w-full accent-brand-600"
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <ColorField label={t("primary")} value={theme.primary} onChange={(primary) => set({ primary })} />
            <ColorField label={t("text")} value={theme.text} onChange={(text) => set({ text })} />
            <ColorField label={t("door")} value={theme.door} onChange={(door) => set({ door })} />
            <ColorField label={t("doorText")} value={theme.doorText} onChange={(doorText) => set({ doorText })} />
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("font")}>
              <Select value={theme.font} onChange={(e) => set({ font: e.target.value as CalendarTheme["font"] })}>
                {(["festive", "sans", "serif", "handwritten"] as const).map((f) => (
                  <option key={f} value={f}>
                    {t(`fonts.${f}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("doorShape")}>
              <Select value={theme.doorShape} onChange={(e) => set({ doorShape: e.target.value as CalendarTheme["doorShape"] })}>
                {(["square", "rounded", "circle", "mixed"] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`shapes.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t("layout")}>
            <Select value={theme.layout} onChange={(e) => set({ layout: e.target.value as CalendarTheme["layout"] })}>
              <option value="shuffle">{t("layouts.shuffle")}</option>
              <option value="grid">{t("layouts.grid")}</option>
            </Select>
          </Field>
          <Toggle label={t("snow")} checked={theme.snow} onChange={(e) => set({ snow: e.target.checked })} />
          <Toggle label={t("showNumbers")} checked={theme.showNumbers} onChange={(e) => set({ showNumbers: e.target.checked })} />
        </Card>

        <Card className="space-y-4 p-4">
          <Field label={t("doorAnimation")}>
            <Select value={door} onChange={(e) => setDoor(e.target.value)}>
              {DOOR_ANIMATIONS.map((a) => (
                <option key={a} value={a}>
                  {t(`doorAnimations.${a}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("openAnimation")}>
            <div className="flex gap-2">
              <Select value={open} onChange={(e) => setOpen(e.target.value)}>
                {OPEN_ANIMATIONS.map((a) => (
                  <option key={a} value={a}>
                    {t(`openAnimations.${a}`)}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => playEffect(open, [theme.primary, theme.door, "#fff"])}>
                <Play className="h-4 w-4" />
              </Button>
            </div>
          </Field>
        </Card>

        {status && <Alert tone="success">{status}</Alert>}
        <Button
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await updateAppearanceAction(calendarId, { theme, door_animation: door, open_animation: open });
              setStatus(res?.success ?? tc("saved"));
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {tc("save")}
        </Button>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <div className="mb-2 text-sm font-medium text-muted">👀 {t("livePreview")}</div>
        <div className="overflow-hidden rounded-2xl border border-line shadow-lift">
          <CalendarView
            slug={slug}
            title={title}
            description={description}
            theme={theme}
            doorAnimation={door}
            openAnimation={open}
            days={sampleDays}
            mode="demo"
            compact
          />
        </div>
      </div>
    </div>
  );
}
