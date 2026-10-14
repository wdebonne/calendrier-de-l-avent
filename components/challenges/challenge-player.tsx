"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Lightbulb, Loader2 } from "lucide-react";
import { unlockedHints, type PublicChallenge } from "@/lib/challenges";
import { cn } from "@/lib/utils";

export type SubmitResult = {
  correct: boolean;
  attemptsLeft?: number | null;
  message?: string | null;
  error?: string;
};

export function ChallengePlayer({
  challenge,
  initialAttemptsUsed = 0,
  accent = "#c8102e",
  onSubmit,
  onHint,
  onSkip,
  testMode,
}: {
  challenge: PublicChallenge;
  initialAttemptsUsed?: number;
  accent?: string;
  onSubmit: (answer: unknown, meta: { durationMs: number; hintsUsed: number }) => Promise<SubmitResult>;
  onHint?: (index: number) => void;
  onSkip?: () => void;
  testMode?: boolean;
}) {
  const t = useTranslations("challenge");
  const [wrong, setWrong] = useState(initialAttemptsUsed);
  const [seconds, setSeconds] = useState(0);
  const [feedback, setFeedback] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(
    challenge.maxAttempts > 0 ? Math.max(0, challenge.maxAttempts - initialAttemptsUsed) : null,
  );
  const [shake, setShake] = useState(0);
  const startedAt = useRef(Date.now());
  const loggedHints = useRef(new Set<number>());

  useEffect(() => {
    const i = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(i);
  }, []);

  const visibleHints = useMemo(() => unlockedHints(challenge.hints, wrong, seconds), [challenge.hints, wrong, seconds]);
  useEffect(() => {
    for (const i of visibleHints) {
      if (!loggedHints.current.has(i)) {
        loggedHints.current.add(i);
        onHint?.(i);
      }
    }
  }, [visibleHints, onHint]);

  const exhausted = attemptsLeft === 0;

  async function submit(answer: unknown) {
    if (pending || exhausted) return;
    setPending(true);
    setFeedback(null);
    try {
      const res = await onSubmit(answer, { durationMs: Date.now() - startedAt.current, hintsUsed: visibleHints.length });
      if (res.error) {
        setFeedback({ tone: "error", text: res.error });
        return;
      }
      if (!res.correct) {
        setWrong((w) => w + 1);
        setShake((s) => s + 1);
        if (res.attemptsLeft !== undefined) setAttemptsLeft(res.attemptsLeft ?? null);
        setFeedback({
          tone: "error",
          text: res.attemptsLeft === 0 ? res.message || t("noAttempts") : t("wrong"),
        });
      }
    } finally {
      setPending(false);
    }
  }

  const pendingHints = challenge.hints.length - visibleHints.length;

  return (
    <div className="space-y-5">
      {testMode && (
        <div className="rounded-lg bg-amber-100 px-3 py-1.5 text-center text-xs font-medium text-amber-900">{t("testMode")}</div>
      )}
      <div className="text-center">
        {challenge.title && <h3 className="text-xl font-bold">{challenge.title}</h3>}
        {challenge.prompt && <p className="mt-2 whitespace-pre-line text-stone-600">{challenge.prompt}</p>}
      </div>

      <motion.div key={shake} animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : undefined} transition={{ duration: 0.4 }}>
        {exhausted ? (
          <div className="rounded-xl bg-stone-100 p-4 text-center text-sm text-stone-600">{feedback?.text || t("noAttempts")}</div>
        ) : (
          <ChallengeInput challenge={challenge} pending={pending} accent={accent} onSubmit={submit} />
        )}
      </motion.div>

      {feedback && !exhausted && (
        <p className={cn("text-center text-sm font-medium", feedback.tone === "error" ? "text-brand-700" : "text-stone-600")}>
          {feedback.text}
        </p>
      )}
      {attemptsLeft !== null && !exhausted && (
        <p className="text-center text-xs text-muted">{t("attemptsLeft", { count: attemptsLeft })}</p>
      )}

      {(visibleHints.length > 0 || pendingHints > 0) && (
        <div className="space-y-2">
          {visibleHints.map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{t("hint", { number: i + 1 })} :</strong> {challenge.hints[i].text}
              </span>
            </motion.div>
          ))}
          {pendingHints > 0 && <p className="text-center text-xs text-muted">💡 {t("nextHint")}</p>}
        </div>
      )}

      {onSkip && (
        <div className="text-center">
          <button type="button" onClick={onSkip} className="text-xs font-medium text-muted underline hover:text-ink">
            {t("skip")}
          </button>
        </div>
      )}
    </div>
  );
}

function SubmitButton({ pending, accent, label, disabled }: { pending: boolean; accent: string; label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-6 font-semibold text-white shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-50"
      style={{ background: accent }}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  );
}

function ChallengeInput({
  challenge,
  pending,
  accent,
  onSubmit,
}: {
  challenge: PublicChallenge;
  pending: boolean;
  accent: string;
  onSubmit: (answer: unknown) => void;
}) {
  const t = useTranslations("challenge");
  switch (challenge.type) {
    case "riddle":
      return <TextAnswer pending={pending} accent={accent} onSubmit={onSubmit} placeholder={t("answer")} label={t("submit")} />;
    case "code":
      return <CodeAnswer length={challenge.length} pending={pending} accent={accent} onSubmit={onSubmit} label={t("submit")} />;
    case "choice":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {challenge.options.map((o, i) => (
            <button
              key={i}
              type="button"
              disabled={pending}
              onClick={() => onSubmit(i)}
              className="rounded-xl border-2 border-line bg-white px-4 py-3 text-left font-medium transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"
              style={{ borderColor: undefined }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = accent)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
            >
              <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-stone-100 text-xs font-bold">
                {String.fromCharCode(65 + i)}
              </span>
              {o}
            </button>
          ))}
        </div>
      );
    case "truefalse":
      return <TrueFalse items={challenge.items} pending={pending} accent={accent} onSubmit={onSubmit} />;
    case "scramble":
      return <Scramble letters={challenge.letters} pending={pending} accent={accent} onSubmit={onSubmit} />;
    case "memory":
      return <Memory symbols={challenge.symbols} onSubmit={onSubmit} accent={accent} />;
    case "slider":
      return <Slider size={challenge.size} image={challenge.image} onSubmit={onSubmit} accent={accent} />;
  }
}

function TextAnswer({
  pending,
  accent,
  onSubmit,
  placeholder,
  label,
}: {
  pending: boolean;
  accent: string;
  onSubmit: (a: unknown) => void;
  placeholder: string;
  label: string;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value);
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoFocus
        className="h-11 flex-1 rounded-xl border-2 border-line bg-white px-4 text-base outline-none focus:border-stone-400"
      />
      <SubmitButton pending={pending} accent={accent} label={label} disabled={!value.trim()} />
    </form>
  );
}

function CodeAnswer({
  length,
  pending,
  accent,
  onSubmit,
  label,
}: {
  length: number;
  pending: boolean;
  accent: string;
  onSubmit: (a: unknown) => void;
  label: string;
}) {
  const [chars, setChars] = useState<string[]>(Array(length).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const value = chars.join("");
  return (
    <form
      className="flex flex-col items-center gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.length === length) onSubmit(value);
      }}
    >
      <div className="flex items-center gap-2 rounded-2xl bg-stone-800 p-3 shadow-inner">
        <span className="mr-1 text-2xl">🔒</span>
        {chars.map((c, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={c}
            inputMode={/^\d*$/.test(value) ? "numeric" : "text"}
            maxLength={1}
            autoFocus={i === 0}
            onChange={(e) => {
              const v = e.target.value.slice(-1).toUpperCase();
              setChars((prev) => prev.map((p, j) => (j === i ? v : p)));
              if (v && i < length - 1) refs.current[i + 1]?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !chars[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text").replace(/\s/g, "").slice(0, length).toUpperCase();
              if (text) {
                e.preventDefault();
                setChars(Array.from({ length }, (_, j) => text[j] ?? ""));
              }
            }}
            className="h-12 w-10 rounded-lg bg-stone-100 text-center font-mono text-2xl font-bold text-stone-900 outline-none focus:ring-4 sm:w-12"
          />
        ))}
      </div>
      <SubmitButton pending={pending} accent={accent} label={label} disabled={value.length !== length} />
    </form>
  );
}

function TrueFalse({
  items,
  pending,
  accent,
  onSubmit,
}: {
  items: string[];
  pending: boolean;
  accent: string;
  onSubmit: (a: unknown) => void;
}) {
  const t = useTranslations("challenge");
  const [answers, setAnswers] = useState<(boolean | null)[]>(items.map(() => null));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (answers.every((a) => a !== null)) onSubmit(answers);
      }}
    >
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3 sm:flex-row sm:items-center">
          <span className="flex-1 text-sm font-medium">{item}</span>
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setAnswers((prev) => prev.map((p, j) => (j === i ? v : p)))}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
                  answers[i] === v ? "border-transparent text-white" : "border-line bg-white text-stone-600 hover:bg-stone-50",
                )}
                style={answers[i] === v ? { background: v ? "#15803d" : "#b91c1c" } : undefined}
              >
                {v ? t("trueLabel") : t("falseLabel")}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-center">
        <SubmitButton pending={pending} accent={accent} label={t("submit")} disabled={answers.some((a) => a === null)} />
      </div>
    </form>
  );
}

function Scramble({
  letters,
  pending,
  accent,
  onSubmit,
}: {
  letters: string[];
  pending: boolean;
  accent: string;
  onSubmit: (a: unknown) => void;
}) {
  const t = useTranslations("challenge");
  const [picked, setPicked] = useState<number[]>([]);
  const word = picked.map((i) => letters[i]).join("");
  useEffect(() => {
    if (picked.length === letters.length && letters.length > 0) onSubmit(word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked.length]);
  return (
    <div className="space-y-4">
      <p className="text-center text-xs text-muted">{t("pickLetters")}</p>
      <div className="flex min-h-14 flex-wrap justify-center gap-1.5 rounded-xl border-2 border-dashed border-stone-300 p-2">
        {picked.map((i, k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPicked((p) => p.filter((_, j) => j !== k))}
            className="grid h-10 w-10 place-items-center rounded-lg text-lg font-bold text-white shadow"
            style={{ background: accent }}
          >
            {letters[i]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {letters.map((l, i) => (
          <button
            key={i}
            type="button"
            disabled={picked.includes(i) || pending}
            onClick={() => setPicked((p) => [...p, i])}
            className="grid h-11 w-11 place-items-center rounded-lg border-2 border-line bg-white text-lg font-bold shadow-sm transition hover:-translate-y-0.5 disabled:opacity-20"
          >
            {l}
          </button>
        ))}
      </div>
      <div className="text-center">
        <button type="button" onClick={() => setPicked([])} className="text-xs font-medium text-muted underline">
          {t("clear")}
        </button>
      </div>
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Memory({ symbols, onSubmit, accent }: { symbols: string[]; onSubmit: (a: unknown) => void; accent: string }) {
  const t = useTranslations("challenge");
  const [deck, setDeck] = useState<string[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);

  const reset = () => {
    setDeck(shuffle([...symbols, ...symbols]));
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
  };
  useEffect(reset, [symbols]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (deck.length && matched.size === deck.length) onSubmit({ completed: true, moves });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched.size]);

  function flip(i: number) {
    if (flipped.length === 2 || flipped.includes(i) || matched.has(i)) return;
    const next = [...flipped, i];
    setFlipped(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      if (deck[next[0]] === deck[next[1]]) {
        setTimeout(() => {
          setMatched((m) => new Set([...m, ...next]));
          setFlipped([]);
        }, 350);
      } else {
        setTimeout(() => setFlipped([]), 800);
      }
    }
  }

  const cols = deck.length <= 12 ? 4 : deck.length <= 16 ? 4 : 6;
  return (
    <div className="space-y-3">
      <div className="mx-auto grid max-w-sm gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {deck.map((s, i) => {
          const visible = flipped.includes(i) || matched.has(i);
          return (
            <button key={i} type="button" onClick={() => flip(i)} className="perspective aspect-square" aria-label={visible ? s : "?"}>
              <motion.div
                className="preserve-3d relative h-full w-full"
                animate={{ rotateY: visible ? 180 : 0 }}
                transition={{ duration: 0.35 }}
              >
                <div
                  className="backface-hidden absolute inset-0 grid place-items-center rounded-xl text-xl font-bold text-white shadow"
                  style={{ background: accent }}
                >
                  ?
                </div>
                <div
                  className={cn(
                    "backface-hidden absolute inset-0 grid place-items-center rounded-xl border-2 bg-white text-3xl shadow",
                    matched.has(i) ? "border-pine-500" : "border-line",
                  )}
                  style={{ transform: "rotateY(180deg)" }}
                >
                  {s}
                </div>
              </motion.div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-4 text-xs text-muted">
        <span>{t("moves", { count: moves })}</span>
        <button type="button" onClick={reset} className="font-medium underline">
          {t("restart")}
        </button>
      </div>
    </div>
  );
}

function scrambledBoard(size: number): number[] {
  // Random legal moves from the solved state guarantee a solvable puzzle.
  const n = size * size;
  const board = Array.from({ length: n }, (_, i) => (i + 1) % n);
  let empty = n - 1;
  let prev = -1;
  for (let k = 0; k < size * size * 20; k++) {
    const r = Math.floor(empty / size);
    const c = empty % size;
    const options = [
      r > 0 ? empty - size : -1,
      r < size - 1 ? empty + size : -1,
      c > 0 ? empty - 1 : -1,
      c < size - 1 ? empty + 1 : -1,
    ].filter((x) => x >= 0 && x !== prev);
    const pick = options[Math.floor(Math.random() * options.length)];
    [board[empty], board[pick]] = [board[pick], board[empty]];
    prev = empty;
    empty = pick;
  }
  return board;
}

function Slider({ size, image, onSubmit, accent }: { size: number; image?: string; onSubmit: (a: unknown) => void; accent: string }) {
  const t = useTranslations("challenge");
  const [board, setBoard] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);
  const reset = () => {
    setBoard(scrambledBoard(size));
    setMoves(0);
    setDone(false);
  };
  useEffect(reset, [size]); // eslint-disable-line react-hooks/exhaustive-deps

  function move(i: number) {
    if (done) return;
    const empty = board.indexOf(0);
    const [r1, c1, r2, c2] = [Math.floor(i / size), i % size, Math.floor(empty / size), empty % size];
    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return;
    const next = [...board];
    [next[i], next[empty]] = [next[empty], next[i]];
    setBoard(next);
    setMoves((m) => m + 1);
    if (next.every((v, k) => v === (k + 1) % (size * size))) {
      setDone(true);
      onSubmit({ completed: true, moves: moves + 1 });
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="mx-auto grid aspect-square w-full max-w-xs gap-1 rounded-2xl bg-stone-800 p-1.5"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {board.map((v, i) =>
          v === 0 ? (
            <div key="empty" />
          ) : (
            <motion.button
              layout
              key={v}
              type="button"
              onClick={() => move(i)}
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
              className="grid place-items-center rounded-lg text-xl font-bold text-white shadow"
              style={
                image
                  ? {
                      backgroundImage: `url("${image}")`,
                      backgroundSize: `${size * 100}% ${size * 100}%`,
                      backgroundPosition: `${(((v - 1) % size) / (size - 1)) * 100}% ${(Math.floor((v - 1) / size) / (size - 1)) * 100}%`,
                    }
                  : { background: accent }
              }
            >
              {!image && v}
            </motion.button>
          ),
        )}
      </div>
      <div className="flex items-center justify-center gap-4 text-xs text-muted">
        <span>{t("moves", { count: moves })}</span>
        <button type="button" onClick={reset} className="font-medium underline">
          {t("restart")}
        </button>
      </div>
    </div>
  );
}
