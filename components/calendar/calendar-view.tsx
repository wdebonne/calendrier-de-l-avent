"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { DayContent, PublicDay } from "@/lib/calendar/public";
import { seededShuffle, type CalendarTheme } from "@/lib/calendar/theme";
import { cn } from "@/lib/utils";
import { ChallengePlayer, type SubmitResult } from "@/components/challenges/challenge-player";
import { ContentView } from "./content-view";
import { Door, type DoorState } from "./door";
import { playEffect } from "./effects";
import { Modal } from "./modal";
import { Snow } from "./snow";

export const FONT_CLASS: Record<CalendarTheme["font"], string> = {
  festive: "font-festive",
  sans: "font-sans",
  serif: "font-serif",
  handwritten: "font-hand",
};

interface Props {
  slug: string;
  title: string;
  description: string | null;
  theme: CalendarTheme;
  doorAnimation: string;
  openAnimation: string;
  days: PublicDay[];
  preview?: boolean;
  source?: string;
  /** "demo" is used by the appearance editor: no network calls, doors just animate. */
  mode?: "live" | "demo";
  compact?: boolean;
}

async function api(slug: string, action: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/c/${slug}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export function CalendarView({
  slug,
  title,
  description,
  theme,
  doorAnimation,
  openAnimation,
  days: initialDays,
  preview = false,
  source,
  mode = "live",
  compact,
}: Props) {
  const t = useTranslations("public");
  const format = useFormatter();
  const [days, setDays] = useState(initialDays);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [opening, setOpening] = useState<string | null>(null);
  const [content, setContent] = useState<DayContent | null>(null);
  const [challengeDay, setChallengeDay] = useState<PublicDay | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [shakes, setShakes] = useState<Record<string, number>>({});
  const pendingContent = useRef<{ dayId: string; content: DayContent | null; animDone: boolean } | null>(null);
  const contentShownAt = useRef<number>(0);
  const contentDayId = useRef<string | null>(null);
  const storageKey = `advent_opened_${slug}`;

  useEffect(() => setDays(initialDays), [initialDays]);

  // Restore opened doors for this visitor.
  useEffect(() => {
    if (mode !== "live" || preview) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved)) setOpened(new Set(saved.filter((x) => typeof x === "string")));
    } catch {
      /* storage unavailable */
    }
  }, [storageKey, mode, preview]);

  // Count the visit once per browser session.
  useEffect(() => {
    if (mode !== "live" || preview) return;
    const key = `advent_visit_${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    api(slug, "visit", { source: source === "qr" ? "qr" : "direct", referrer: document.referrer }).catch(() => {});
  }, [slug, source, mode, preview]);

  const markOpened = useCallback(
    (id: string) => {
      setOpened((prev) => {
        const next = new Set(prev).add(id);
        if (!preview && mode === "live") {
          try {
            localStorage.setItem(storageKey, JSON.stringify([...next]));
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    },
    [preview, mode, storageKey],
  );

  const ordered = useMemo(
    () => (theme.layout === "shuffle" ? seededShuffle(days, slug) : [...days].sort((a, b) => a.date.localeCompare(b.date))),
    [days, theme.layout, slug],
  );
  const lastDate = useMemo(() => days.reduce((m, d) => (d.date > m ? d.date : m), ""), [days]);

  const showContent = useCallback(
    (dayId: string, c: DayContent) => {
      setContent(c);
      contentShownAt.current = Date.now();
      contentDayId.current = dayId;
      markOpened(dayId);
      setTimeout(() => playEffect(c.animation, [theme.primary, theme.door, "#ffffff", "#16a34a"]), 150);
    },
    [markOpened, theme.primary, theme.door],
  );

  const tryReveal = useCallback(() => {
    const p = pendingContent.current;
    if (!p || !p.animDone || !p.content) return;
    pendingContent.current = null;
    setOpening(null);
    showContent(p.dayId, p.content);
  }, [showContent]);

  function startOpening(day: PublicDay, known?: DayContent) {
    setOpening(day.id);
    pendingContent.current = { dayId: day.id, content: known ?? null, animDone: false };
    if (!known) {
      api(slug, "open", { dayId: day.id, preview }).then(({ ok, json }) => {
        if (!pendingContent.current || pendingContent.current.dayId !== day.id) return;
        if (ok && json.content) {
          pendingContent.current.content = json.content;
          tryReveal();
        } else {
          pendingContent.current = null;
          setOpening(null);
          if (json.error === "challenge_required") setChallengeDay(day);
          else if (json.error === "locked") showLocked(day);
        }
      });
    }
  }

  function showLocked(day: PublicDay) {
    setShakes((s) => ({ ...s, [day.id]: (s[day.id] ?? 0) + 1 }));
    setToast(t("locked", { date: format.dateTime(new Date(`${day.date}T12:00:00`), { day: "numeric", month: "long" }) }));
    setTimeout(() => setToast(null), 2600);
  }

  async function handleClick(day: PublicDay) {
    if (opening) return;
    if (mode === "demo") {
      setOpening(day.id);
      setTimeout(() => setOpening(null), 1400);
      return;
    }
    if (!day.available) {
      showLocked(day);
      if (!preview) api(slug, "open", { dayId: day.id }).catch(() => {});
      return;
    }
    if (opened.has(day.id) && (!day.challenge || day.solved || preview)) {
      const { ok, json } = await api(slug, "open", { dayId: day.id, preview });
      if (ok && json.content) showContent(day.id, json.content);
      else if (json.error === "challenge_required") setChallengeDay(day);
      return;
    }
    if (day.challenge && !day.solved) {
      setChallengeDay(day);
      return;
    }
    startOpening(day);
  }

  async function submitChallenge(answer: unknown, meta: { durationMs: number; hintsUsed: number }): Promise<SubmitResult> {
    const day = challengeDay!;
    const { ok, status, json } = await api(slug, "solve", { dayId: day.id, answer, preview, ...meta });
    if (status === 429) return { correct: false, error: "⏳" };
    if (!ok) return { correct: false, error: json.error ?? "error" };
    if (json.correct && json.content) {
      setDays((ds) => ds.map((d) => (d.id === day.id ? { ...d, solved: true } : d)));
      setChallengeDay(null);
      setTimeout(() => startOpening({ ...day, solved: true }, json.content), 250);
    }
    return { correct: !!json.correct, attemptsLeft: json.attemptsLeft, message: json.message };
  }

  function closeContent() {
    if (contentDayId.current && mode === "live" && !preview) {
      api(slug, "event", {
        dayId: contentDayId.current,
        type: "close",
        durationMs: Date.now() - contentShownAt.current,
      }).catch(() => {});
    }
    contentDayId.current = null;
    setContent(null);
  }

  const doorState = (d: PublicDay): DoorState =>
    opening === d.id ? "opening" : opened.has(d.id) ? "opened" : d.available ? "available" : "locked";

  const fontClass = FONT_CLASS[theme.font];
  const openedCount = days.filter((d) => opened.has(d.id)).length;

  return (
    <div
      className={cn("relative isolate overflow-hidden", compact ? "min-h-full rounded-2xl" : "min-h-dvh")}
      style={{ background: theme.background, color: theme.text }}
    >
      {theme.backgroundImage && (
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center"
          style={{ backgroundImage: `url("${theme.backgroundImage}")` }}
        />
      )}
      {theme.backgroundImage && <div className="absolute inset-0 -z-10 bg-black" style={{ opacity: theme.overlay }} />}
      {theme.snow && <Snow count={compact ? 25 : 60} />}

      {preview && (
        <div className="relative z-10 bg-amber-300 px-4 py-2 text-center text-xs font-semibold text-amber-950">
          👀 {t("previewBanner")}
        </div>
      )}

      <div className={cn("relative z-10 mx-auto max-w-5xl px-4", compact ? "py-6" : "py-10 sm:py-14")}>
        <header className="mb-8 text-center">
          <motion.h1
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("font-bold leading-tight drop-shadow", fontClass, compact ? "text-3xl" : "text-4xl sm:text-6xl")}
          >
            {title}
          </motion.h1>
          {description && (
            <p className={cn("mx-auto mt-3 max-w-2xl whitespace-pre-line opacity-90", compact ? "text-sm" : "text-base sm:text-lg")}>
              {description}
            </p>
          )}
          {mode === "live" && !preview && openedCount > 0 && (
            <div
              className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur"
              style={{ background: `${theme.door}33` }}
            >
              🎁 {t("daysOpened", { opened: openedCount, total: days.length })}
            </div>
          )}
        </header>

        <div
          className={cn(
            "grid grid-flow-dense gap-2.5 sm:gap-3.5",
            compact ? "grid-cols-4 sm:grid-cols-6" : days.length <= 12 ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6",
          )}
        >
          {ordered.map((d, i) => {
            const isBig = theme.doorShape === "mixed" && d.date === lastDate && days.length >= 8;
            const isWide = theme.doorShape === "mixed" && !isBig && i % 9 === 4 && days.length >= 12;
            return (
              <Door
                key={d.id}
                number={d.number}
                label={d.label}
                cover={d.cover_url}
                state={doorState(d)}
                theme={theme}
                animation={doorAnimation}
                index={i}
                big={isBig}
                wide={isWide}
                hasChallenge={!!d.challenge && !d.solved}
                onClick={() => handleClick(d)}
                shakeKey={shakes[d.id]}
                onOpened={() => {
                  if (mode === "demo") return;
                  if (pendingContent.current?.dayId === d.id) {
                    pendingContent.current.animDone = true;
                    tryReveal();
                  }
                }}
              />
            );
          })}
        </div>

        {!compact && <p className="mt-12 text-center text-xs opacity-60">{t("poweredBy")}</p>}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed inset-x-0 bottom-6 z-40 mx-auto w-fit max-w-[90vw] rounded-full bg-stone-900/90 px-5 py-3 text-center text-sm font-medium text-white shadow-xl backdrop-blur"
          >
            ⏳ <strong>{t("lockedTitle")}</strong> {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={!!challengeDay} onClose={() => setChallengeDay(null)} label="challenge">
        {challengeDay?.challenge && (
          <div className="pt-2">
            <div className={cn("mb-3 text-center text-5xl font-bold", fontClass)} style={{ color: theme.primary === "#ffffff" ? "#c8102e" : theme.primary }}>
              {challengeDay.number}
            </div>
            <ChallengePlayer
              key={challengeDay.id}
              challenge={challengeDay.challenge}
              initialAttemptsUsed={preview ? 0 : challengeDay.attemptsUsed}
              accent={pickReadableAccent(theme)}
              onSubmit={submitChallenge}
              onHint={(index) => {
                if (!preview) api(slug, "event", { dayId: challengeDay.id, type: "hint", index }).catch(() => {});
              }}
              onSkip={
                preview
                  ? () => {
                      const d = challengeDay;
                      setChallengeDay(null);
                      startOpening({ ...d, solved: true });
                    }
                  : undefined
              }
            />
          </div>
        )}
      </Modal>

      <Modal open={!!content} onClose={closeContent} variant={content?.animation} label={content?.label ?? "content"}>
        {content && <ContentView content={content} accent={pickReadableAccent(theme)} fontClass={fontClass} />}
      </Modal>
    </div>
  );
}

/** Accent used on white modals: falls back to brand red when the theme accent is too light. */
function pickReadableAccent(theme: CalendarTheme) {
  const hex = theme.primary.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#c8102e";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance < 0.72) return theme.primary;
  const dh = theme.doorText.replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(dh)) {
    const [r2, g2, b2] = [0, 2, 4].map((i) => parseInt(dh.slice(i, i + 2), 16));
    if ((0.299 * r2 + 0.587 * g2 + 0.114 * b2) / 255 < 0.6) return theme.doorText;
  }
  return "#c8102e";
}
