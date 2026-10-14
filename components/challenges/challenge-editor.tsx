"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Sparkles, Trash2, FlaskConical } from "lucide-react";
import { Button, Field, Input, Select, Textarea, Toggle } from "@/components/ui";
import { MediaInput } from "@/components/media-input";
import { Modal } from "@/components/calendar/modal";
import { CHALLENGE_TYPES, parseChallenge, toPublicChallenge, verifyAnswer, type Challenge, type ChallengeType } from "@/lib/challenges";
import { CHALLENGE_TEMPLATES } from "@/lib/challenges/templates";
import { cn } from "@/lib/utils";
import { playEffect } from "@/components/calendar/effects";
import { ChallengePlayer } from "./challenge-player";

// Editor state is a loose object so partially-filled challenges can be edited freely.
export type ChallengeDraft = Record<string, unknown> & { type: ChallengeType };

export function emptyChallenge(type: ChallengeType): ChallengeDraft {
  const base = { title: "", prompt: "", hints: [], maxAttempts: 0 };
  switch (type) {
    case "riddle":
      return { ...base, type, answers: [""] };
    case "code":
      return { ...base, type, code: "" };
    case "choice":
      return { ...base, type, options: ["", ""], correct: 0 };
    case "truefalse":
      return { ...base, type, items: [{ text: "", answer: true }] };
    case "scramble":
      return { ...base, type, word: "" };
    case "memory":
      return { ...base, type, symbols: ["🎄", "🎁", "⛄", "🦌"] };
    case "slider":
      return { ...base, type, size: 3 };
  }
}

export function ChallengeEditor({
  value,
  onChange,
}: {
  value: ChallengeDraft | null;
  onChange: (v: ChallengeDraft | null) => void;
}) {
  const t = useTranslations("challenge");
  const td = useTranslations("days");
  const locale = useLocale() as "fr" | "en";
  const [showTemplates, setShowTemplates] = useState(false);
  const [testing, setTesting] = useState<Challenge | null>(null);
  const [testKey, setTestKey] = useState(0);
  const [testSolved, setTestSolved] = useState<string | null>(null);

  const set = (patch: Record<string, unknown>) => value && onChange({ ...value, ...patch });
  const valid = value ? parseChallenge(value) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select
          value={value?.type ?? ""}
          onChange={(e) => onChange(e.target.value ? emptyChallenge(e.target.value as ChallengeType) : null)}
          className="w-auto min-w-56 flex-1"
        >
          <option value="">{td("challengeNone")}</option>
          {CHALLENGE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </Select>
        <Button type="button" variant="outline" onClick={() => setShowTemplates(true)}>
          <Sparkles className="h-4 w-4" /> {td("useTemplate")}
        </Button>
        {value && (
          <Button
            type="button"
            variant="secondary"
            disabled={!valid}
            title={!valid ? td("invalidChallenge") : undefined}
            onClick={() => {
              setTesting(valid);
              setTestSolved(null);
              setTestKey((k) => k + 1);
            }}
          >
            <FlaskConical className="h-4 w-4" /> {td("testChallenge")}
          </Button>
        )}
      </div>

      {value && (
        <div className="space-y-4 rounded-2xl border border-line bg-stone-50/60 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("title")}>
              <Input value={String(value.title ?? "")} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label={t("maxAttempts")}>
              <Input
                type="number"
                min={0}
                max={100}
                value={Number(value.maxAttempts ?? 0)}
                onChange={(e) => set({ maxAttempts: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label={t("prompt")}>
            <Textarea rows={2} value={String(value.prompt ?? "")} onChange={(e) => set({ prompt: e.target.value })} />
          </Field>

          <TypeFields value={value} set={set} />

          <HintsEditor hints={(value.hints as HintDraft[]) ?? []} onChange={(hints) => set({ hints })} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("successMessage")}>
              <Input value={String(value.successMessage ?? "")} onChange={(e) => set({ successMessage: e.target.value })} />
            </Field>
            {Number(value.maxAttempts) > 0 && (
              <Field label={t("failMessage")}>
                <Input value={String(value.failMessage ?? "")} onChange={(e) => set({ failMessage: e.target.value })} />
              </Field>
            )}
          </div>
          {!valid && <p className="text-xs font-medium text-amber-700">⚠ {td("invalidChallenge")}</p>}
        </div>
      )}

      <Modal open={showTemplates} onClose={() => setShowTemplates(false)} className="sm:max-w-2xl" label={td("templates")}>
        <h3 className="mb-4 text-lg font-bold">{td("templates")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHALLENGE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                onChange(structuredClone(tpl.challenge[locale]) as unknown as ChallengeDraft);
                setShowTemplates(false);
              }}
              className="flex gap-3 rounded-2xl border border-line bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
            >
              <span className="text-3xl">{tpl.icon}</span>
              <span>
                <span className="block font-semibold">{tpl.name[locale]}</span>
                <span className="mt-0.5 block text-xs text-muted">{tpl.description[locale]}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={!!testing} onClose={() => setTesting(null)} label={td("testChallenge")}>
        {testing && testSolved !== null && (
          <div className="py-6 text-center">
            <div className="text-6xl">🎉</div>
            <p className="mt-3 text-lg font-bold">{testSolved}</p>
            <Button type="button" variant="outline" className="mt-5" onClick={() => setTestSolved(null)}>
              {t("restart")}
            </Button>
          </div>
        )}
        {testing && testSolved === null && (
          <ChallengePlayer
            key={testKey}
            testMode
            challenge={toPublicChallenge(testing, `test-${testKey}`)}
            onSubmit={async (answer) => {
              await new Promise((r) => setTimeout(r, 250));
              const correct = verifyAnswer(testing, answer);
              if (correct) {
                playEffect("confetti");
                setTestSolved(testing.successMessage || t("solved"));
              }
              return { correct };
            }}
          />
        )}
      </Modal>
    </div>
  );
}

type HintDraft = { text: string; afterAttempts?: number; afterSeconds?: number };

function HintsEditor({ hints, onChange }: { hints: HintDraft[]; onChange: (h: HintDraft[]) => void }) {
  const t = useTranslations("challenge");
  const update = (i: number, patch: Partial<HintDraft>) => onChange(hints.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-stone-700">💡 {t("hints")}</div>
      <div className="space-y-2">
        {hints.map((h, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-line bg-white p-2 sm:grid-cols-[1fr_7rem_7rem_auto]">
            <Input value={h.text} placeholder={t("hintText")} onChange={(e) => update(i, { text: e.target.value })} />
            <Input
              type="number"
              min={0}
              title={t("afterAttempts")}
              placeholder={t("afterAttempts")}
              value={h.afterAttempts ?? ""}
              onChange={(e) => update(i, { afterAttempts: e.target.value ? Number(e.target.value) : undefined })}
            />
            <Input
              type="number"
              min={0}
              title={t("afterSeconds")}
              placeholder={t("afterSeconds")}
              value={h.afterSeconds ?? ""}
              onChange={(e) => update(i, { afterSeconds: e.target.value ? Number(e.target.value) : undefined })}
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(hints.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => onChange([...hints, { text: "", afterAttempts: 1 }])}>
        <Plus className="h-4 w-4" /> {t("addHint")}
      </Button>
    </div>
  );
}

function TypeFields({ value, set }: { value: ChallengeDraft; set: (p: Record<string, unknown>) => void }) {
  const t = useTranslations("challenge");
  switch (value.type) {
    case "riddle": {
      const answers = (value.answers as string[]) ?? [];
      return (
        <>
          <Field label={t("answers")} hint={t("answersHint")}>
            <Textarea rows={3} value={answers.join("\n")} onChange={(e) => set({ answers: e.target.value.split("\n") })} />
          </Field>
          <Toggle label={t("strict")} checked={!!value.strict} onChange={(e) => set({ strict: e.target.checked })} />
        </>
      );
    }
    case "code":
      return (
        <Field label={t("code")}>
          <Input
            value={String(value.code ?? "")}
            maxLength={12}
            className="font-mono text-lg tracking-widest"
            onChange={(e) => set({ code: e.target.value.replace(/[^0-9A-Za-z]/g, "") })}
          />
        </Field>
      );
    case "choice": {
      const options = (value.options as string[]) ?? [];
      return (
        <div>
          <div className="mb-1.5 text-sm font-medium text-stone-700">
            {t("options")} · <span className="text-muted">{t("correct")} ◉</span>
          </div>
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={Number(value.correct) === i}
                  onChange={() => set({ correct: i })}
                  className="h-4 w-4 accent-pine-600"
                />
                <Input value={o} onChange={(e) => set({ options: options.map((x, j) => (j === i ? e.target.value : x)) })} />
                {options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      set({
                        options: options.filter((_, j) => j !== i),
                        correct: Number(value.correct) >= i && Number(value.correct) > 0 ? Number(value.correct) - 1 : value.correct,
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {options.length < 8 && (
            <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => set({ options: [...options, ""] })}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      );
    }
    case "truefalse": {
      const items = (value.items as { text: string; answer: boolean }[]) ?? [];
      return (
        <div>
          <div className="mb-1.5 text-sm font-medium text-stone-700">{t("items")}</div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={it.text} onChange={(e) => set({ items: items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                <button
                  type="button"
                  onClick={() => set({ items: items.map((x, j) => (j === i ? { ...x, answer: !x.answer } : x)) })}
                  className={cn(
                    "h-10 w-20 shrink-0 rounded-xl text-sm font-semibold text-white",
                    it.answer ? "bg-pine-600" : "bg-brand-600",
                  )}
                >
                  {it.answer ? t("itemTrue") : t("itemFalse")}
                </button>
                <Button type="button" variant="ghost" size="icon" onClick={() => set({ items: items.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => set({ items: [...items, { text: "", answer: true }] })}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      );
    }
    case "scramble":
      return (
        <Field label={t("word")}>
          <Input value={String(value.word ?? "")} maxLength={40} onChange={(e) => set({ word: e.target.value })} />
        </Field>
      );
    case "memory": {
      const symbols = (value.symbols as string[]) ?? [];
      return (
        <Field label={t("symbols")}>
          <Input value={symbols.join(" ")} onChange={(e) => set({ symbols: e.target.value.split(/\s+/).filter(Boolean) })} />
        </Field>
      );
    }
    case "slider":
      return (
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Field label={t("size")}>
            <Select value={Number(value.size ?? 3)} onChange={(e) => set({ size: Number(e.target.value) })}>
              <option value={3}>3 × 3</option>
              <option value={4}>4 × 4</option>
            </Select>
          </Field>
          <Field label={t("image")}>
            <MediaInput value={String(value.image ?? "")} onChange={(image) => set({ image })} />
          </Field>
        </div>
      );
  }
}
