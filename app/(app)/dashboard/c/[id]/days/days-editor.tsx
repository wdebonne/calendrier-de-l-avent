"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { FileText, Film, Image as ImageIcon, Link2, Loader2, Save, SquarePlay, MonitorPlay } from "lucide-react";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { MediaInput } from "@/components/media-input";
import { ChallengeEditor, type ChallengeDraft } from "@/components/challenges/challenge-editor";
import { OPEN_ANIMATIONS } from "@/lib/calendar/theme";
import { cn } from "@/lib/utils";
import { applyAnimationToAllAction, saveDayAction } from "../../../actions";

export interface EditableDay {
  id: string;
  date: string;
  label: string;
  cover_url: string;
  content_type: string;
  content_url: string;
  content_text: string;
  open_animation: string;
  challenge: ChallengeDraft | null;
}

const TYPES = [
  { key: "image", icon: ImageIcon },
  { key: "video", icon: Film },
  { key: "youtube", icon: MonitorPlay },
  { key: "vimeo", icon: SquarePlay },
  { key: "link", icon: Link2 },
  { key: "text", icon: FileText },
] as const;

const filled = (d: EditableDay) => !!(d.content_url || d.content_text);

export function DaysEditor({
  calendarId,
  days: initial,
  defaultAnimation,
  created,
}: {
  calendarId: string;
  days: EditableDay[];
  defaultAnimation: string;
  created: boolean;
}) {
  const t = useTranslations("days");
  const tc = useTranslations("common");
  const tcal = useTranslations("calendar");
  const ta = useTranslations("appearance");
  const format = useFormatter();
  const [days, setDays] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id ?? null);
  const [draft, setDraft] = useState<EditableDay | null>(initial[0] ?? null);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(
    created ? { tone: "success", text: tcal("created") } : null,
  );
  const [pending, start] = useTransition();

  useEffect(() => setDays(initial), [initial]);

  const selected = days.find((d) => d.id === selectedId) ?? null;
  const dirty = useMemo(() => !!draft && !!selected && JSON.stringify(draft) !== JSON.stringify(selected), [draft, selected]);

  function select(id: string) {
    if (dirty && !confirm(tc("unsavedChanges"))) return;
    setSelectedId(id);
    setDraft(days.find((d) => d.id === id) ?? null);
    setStatus(null);
  }

  function update(patch: Partial<EditableDay>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  function save() {
    if (!draft) return;
    start(async () => {
      const res = await saveDayAction(draft.id, draft);
      if (res?.error) setStatus({ tone: "error", text: res.error });
      else {
        setDays((ds) => ds.map((d) => (d.id === draft.id ? draft : d)));
        setStatus({ tone: "success", text: res?.success ?? tc("saved") });
      }
    });
  }

  const filledCount = days.filter(filled).length;
  const dayNum = (date: string) => Number(date.slice(8, 10));
  const isUploadType = draft?.content_type === "image" || draft?.content_type === "video";

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{t("filledCount", { filled: filledCount, total: days.length })}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full bg-gradient-to-r from-brand-500 to-gold-400 transition-all" style={{ width: `${(filledCount / Math.max(1, days.length)) * 100}%` }} />
        </div>
        <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-4">
          {days.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => select(d.id)}
              className={cn(
                "relative grid aspect-square place-items-center rounded-xl border text-sm font-bold transition",
                selectedId === d.id
                  ? "border-brand-500 bg-brand-600 text-white shadow-md shadow-brand-600/30"
                  : filled(d)
                    ? "border-pine-100 bg-pine-50 text-pine-700 hover:border-pine-500"
                    : "border-line bg-white text-stone-500 hover:border-stone-300",
              )}
              title={format.dateTime(new Date(`${d.date}T12:00:00`), { dateStyle: "full" })}
            >
              {dayNum(d.date)}
              {d.challenge && <span className="absolute -right-1 -top-1 text-[10px]">🧩</span>}
              {filled(d) && selectedId !== d.id && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-pine-500" />}
            </button>
          ))}
        </div>
      </div>

      {draft && (
        <motion.div key={draft.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-brand-50 to-transparent px-5 py-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-brand-700">
                  {format.dateTime(new Date(`${draft.date}T12:00:00`), { weekday: "long", day: "numeric", month: "long" })}
                </div>
                <h2 className="text-xl font-bold">{t("day", { number: dayNum(draft.date) })}</h2>
              </div>
              <Button onClick={save} disabled={pending || !dirty}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("saveDay")}
              </Button>
            </div>

            <div className="space-y-6 p-5">
              {status && <Alert tone={status.tone}>{status.text}</Alert>}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("label")}>
                  <Input value={draft.label} placeholder={t("labelPlaceholder")} maxLength={200} onChange={(e) => update({ label: e.target.value })} />
                </Field>
                <Field label={t("cover")}>
                  <MediaInput value={draft.cover_url} onChange={(cover_url) => update({ cover_url })} />
                </Field>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-stone-700">{t("contentType")}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {TYPES.map(({ key, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => update({ content_type: key })}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition",
                        draft.content_type === key
                          ? "border-brand-400 bg-brand-50 text-brand-700 ring-4 ring-brand-100"
                          : "border-line bg-white text-stone-600 hover:border-stone-300",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {t(`types.${key}`)}
                    </button>
                  ))}
                </div>
              </div>

              {draft.content_type !== "text" && (
                <Field label={t("url")} hint={isUploadType ? t("orUpload") : undefined}>
                  {isUploadType ? (
                    <MediaInput
                      key={draft.content_type}
                      value={draft.content_url}
                      accept={draft.content_type === "video" ? "video/*" : "image/*"}
                      onChange={(content_url) => update({ content_url })}
                    />
                  ) : (
                    <Input
                      value={draft.content_url}
                      placeholder={draft.content_type === "youtube" ? t("urlPlaceholderYoutube") : t("urlPlaceholder")}
                      onChange={(e) => update({ content_url: e.target.value })}
                    />
                  )}
                </Field>
              )}

              <Field label={t("text")}>
                <Textarea
                  rows={3}
                  value={draft.content_text}
                  placeholder={t("textPlaceholder")}
                  maxLength={5000}
                  onChange={(e) => update({ content_text: e.target.value })}
                />
              </Field>

              <div className="flex flex-wrap items-end gap-3">
                <Field label={t("animation")} className="min-w-56 flex-1">
                  <Select value={draft.open_animation} onChange={(e) => update({ open_animation: e.target.value })}>
                    <option value="">
                      {t("animationDefault")} ({ta(`openAnimations.${defaultAnimation as (typeof OPEN_ANIMATIONS)[number]}`)})
                    </option>
                    {OPEN_ANIMATIONS.map((a) => (
                      <option key={a} value={a}>
                        {ta(`openAnimations.${a}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await applyAnimationToAllAction(calendarId, draft.open_animation || null);
                      setDays((ds) => ds.map((d) => ({ ...d, open_animation: draft.open_animation })));
                      setStatus({ tone: "success", text: tc("saved") });
                    })
                  }
                >
                  {t("applyToAll")}
                </Button>
              </div>

              <div className="border-t border-line pt-5">
                <div className="mb-3 text-sm font-semibold">🧩 {t("challenge")}</div>
                <ChallengeEditor value={draft.challenge} onChange={(challenge) => update({ challenge })} />
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end border-t border-line bg-white/90 px-5 py-3 backdrop-blur">
              <Button onClick={save} disabled={pending || !dirty}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("saveDay")}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
