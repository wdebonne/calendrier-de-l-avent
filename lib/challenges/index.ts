// Challenge definitions, verification and sanitisation. Pure module: shared by the server
// (authoritative check) and the editor's "test" mode.

export interface Hint {
  text: string;
  /** Hint becomes visible after this many wrong answers. */
  afterAttempts?: number;
  /** ...or after this many seconds spent on the challenge. */
  afterSeconds?: number;
}

interface BaseChallenge {
  title: string;
  prompt: string;
  hints: Hint[];
  /** 0 = unlimited. */
  maxAttempts: number;
  successMessage?: string;
  failMessage?: string;
}

export interface RiddleChallenge extends BaseChallenge {
  type: "riddle";
  answers: string[];
  strict?: boolean;
}
export interface CodeChallenge extends BaseChallenge {
  type: "code";
  code: string;
}
export interface ChoiceChallenge extends BaseChallenge {
  type: "choice";
  options: string[];
  correct: number;
}
export interface TrueFalseChallenge extends BaseChallenge {
  type: "truefalse";
  items: { text: string; answer: boolean }[];
}
export interface ScrambleChallenge extends BaseChallenge {
  type: "scramble";
  word: string;
}
export interface MemoryChallenge extends BaseChallenge {
  type: "memory";
  symbols: string[];
}
export interface SliderChallenge extends BaseChallenge {
  type: "slider";
  size: 3 | 4;
  image?: string;
}

export type Challenge =
  | RiddleChallenge
  | CodeChallenge
  | ChoiceChallenge
  | TrueFalseChallenge
  | ScrambleChallenge
  | MemoryChallenge
  | SliderChallenge;

export type ChallengeType = Challenge["type"];

export const CHALLENGE_TYPES: ChallengeType[] = ["riddle", "code", "choice", "truefalse", "scramble", "memory", "slider"];

/** Games that are played client side: the server only receives a "completed" signal. */
export const GAME_TYPES: ChallengeType[] = ["memory", "slider"];

export function normalizeAnswer(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(le|la|les|l|un|une|des|the|a|an) /, "");
}

export function verifyAnswer(challenge: Challenge, answer: unknown): boolean {
  switch (challenge.type) {
    case "riddle": {
      if (typeof answer !== "string") return false;
      if (challenge.strict) return challenge.answers.some((a) => a.trim() === answer.trim());
      const n = normalizeAnswer(answer);
      return n.length > 0 && challenge.answers.some((a) => normalizeAnswer(a) === n);
    }
    case "code":
      return typeof answer === "string" && answer.replace(/\s/g, "") === challenge.code.replace(/\s/g, "");
    case "choice":
      return typeof answer === "number" && answer === challenge.correct;
    case "truefalse":
      return (
        Array.isArray(answer) &&
        answer.length === challenge.items.length &&
        challenge.items.every((it, i) => answer[i] === it.answer)
      );
    case "scramble":
      return typeof answer === "string" && normalizeAnswer(answer).replace(/ /g, "") === normalizeAnswer(challenge.word).replace(/ /g, "");
    case "memory": {
      const a = answer as { completed?: boolean; moves?: number } | null;
      return !!a && a.completed === true && typeof a.moves === "number" && a.moves >= challenge.symbols.length;
    }
    case "slider": {
      const a = answer as { completed?: boolean; moves?: number } | null;
      return !!a && a.completed === true && typeof a.moves === "number" && a.moves > 0;
    }
  }
}

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
}

export function scrambleWord(word: string, seed: string): string[] {
  const letters = word.toUpperCase().replace(/\s+/g, "").split("");
  const rand = seeded(seed);
  for (let attempt = 0; attempt < 10; attempt++) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    if (letters.join("") !== word.toUpperCase().replace(/\s+/g, "") || letters.length < 2) break;
  }
  return letters;
}

/** What the visitor's browser receives: never the answers. */
export type PublicChallenge =
  | { type: "riddle"; title: string; prompt: string; hints: Hint[]; maxAttempts: number }
  | { type: "code"; title: string; prompt: string; hints: Hint[]; maxAttempts: number; length: number }
  | { type: "choice"; title: string; prompt: string; hints: Hint[]; maxAttempts: number; options: string[] }
  | { type: "truefalse"; title: string; prompt: string; hints: Hint[]; maxAttempts: number; items: string[] }
  | { type: "scramble"; title: string; prompt: string; hints: Hint[]; maxAttempts: number; letters: string[] }
  | { type: "memory"; title: string; prompt: string; hints: Hint[]; maxAttempts: number; symbols: string[] }
  | { type: "slider"; title: string; prompt: string; hints: Hint[]; maxAttempts: number; size: 3 | 4; image?: string };

export function toPublicChallenge(c: Challenge, seed: string): PublicChallenge {
  const base = { title: c.title, prompt: c.prompt, hints: c.hints ?? [], maxAttempts: c.maxAttempts ?? 0 };
  switch (c.type) {
    case "riddle":
      return { type: "riddle", ...base };
    case "code":
      return { type: "code", ...base, length: c.code.replace(/\s/g, "").length };
    case "choice":
      return { type: "choice", ...base, options: c.options };
    case "truefalse":
      return { type: "truefalse", ...base, items: c.items.map((i) => i.text) };
    case "scramble":
      return { type: "scramble", ...base, letters: scrambleWord(c.word, seed) };
    case "memory":
      return { type: "memory", ...base, symbols: c.symbols };
    case "slider":
      return { type: "slider", ...base, size: c.size, image: c.image };
  }
}

/** Validates and cleans a challenge coming from the editor. Returns null when invalid. */
export function parseChallenge(input: unknown): Challenge | null {
  if (!input || typeof input !== "object") return null;
  const c = input as Record<string, unknown>;
  const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
  const hints: Hint[] = Array.isArray(c.hints)
    ? (c.hints as Record<string, unknown>[])
        .filter((h) => h && typeof h.text === "string" && h.text.trim())
        .slice(0, 10)
        .map((h) => ({
          text: str(h.text, 500),
          afterAttempts: Number.isFinite(Number(h.afterAttempts)) && Number(h.afterAttempts) > 0 ? Number(h.afterAttempts) : undefined,
          afterSeconds: Number.isFinite(Number(h.afterSeconds)) && Number(h.afterSeconds) > 0 ? Number(h.afterSeconds) : undefined,
        }))
    : [];
  const base = {
    title: str(c.title, 200),
    prompt: str(c.prompt),
    hints,
    maxAttempts: Math.max(0, Math.min(100, Math.floor(Number(c.maxAttempts) || 0))),
    successMessage: str(c.successMessage, 500) || undefined,
    failMessage: str(c.failMessage, 500) || undefined,
  };
  switch (c.type) {
    case "riddle": {
      const answers = (Array.isArray(c.answers) ? c.answers : []).map((a) => str(a, 200).trim()).filter(Boolean);
      return answers.length ? { type: "riddle", ...base, answers, strict: !!c.strict } : null;
    }
    case "code": {
      const code = str(c.code, 20).replace(/\s/g, "");
      return /^[0-9A-Za-z]{1,12}$/.test(code) ? { type: "code", ...base, code } : null;
    }
    case "choice": {
      const options = (Array.isArray(c.options) ? c.options : []).map((o) => str(o, 300)).filter(Boolean).slice(0, 8);
      const correct = Number(c.correct);
      return options.length >= 2 && correct >= 0 && correct < options.length ? { type: "choice", ...base, options, correct } : null;
    }
    case "truefalse": {
      const items = (Array.isArray(c.items) ? c.items : [])
        .map((i) => ({ text: str((i as Record<string, unknown>)?.text, 300), answer: !!(i as Record<string, unknown>)?.answer }))
        .filter((i) => i.text)
        .slice(0, 10);
      return items.length ? { type: "truefalse", ...base, items } : null;
    }
    case "scramble": {
      const word = str(c.word, 40).trim();
      return word.length >= 2 ? { type: "scramble", ...base, word } : null;
    }
    case "memory": {
      const symbols = (Array.isArray(c.symbols) ? c.symbols : []).map((s) => str(s, 16)).filter(Boolean);
      const unique = [...new Set(symbols)].slice(0, 12);
      return unique.length >= 2 ? { type: "memory", ...base, symbols: unique } : null;
    }
    case "slider": {
      const size = Number(c.size) === 4 ? 4 : 3;
      return { type: "slider", ...base, size, image: str(c.image, 1000) || undefined };
    }
    default:
      return null;
  }
}

/** Hints the visitor is allowed to see given the attempts made and the time spent. */
export function unlockedHints(hints: Hint[], attempts: number, seconds: number): number[] {
  const out: number[] = [];
  hints.forEach((h, i) => {
    const byAttempts = h.afterAttempts === undefined || attempts >= h.afterAttempts;
    const bySeconds = h.afterSeconds === undefined || seconds >= h.afterSeconds;
    // With both conditions, either one unlocks the hint.
    const ok =
      h.afterAttempts !== undefined && h.afterSeconds !== undefined
        ? attempts >= h.afterAttempts || seconds >= h.afterSeconds
        : byAttempts && bySeconds;
    if (ok) out.push(i);
  });
  return out;
}
