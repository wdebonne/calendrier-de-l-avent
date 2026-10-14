export interface CalendarTheme {
  preset: string;
  background: string;
  backgroundImage: string | null;
  overlay: number;
  primary: string;
  door: string;
  doorText: string;
  text: string;
  font: "festive" | "sans" | "serif" | "handwritten";
  layout: "grid" | "shuffle";
  doorShape: "square" | "rounded" | "circle" | "mixed";
  snow: boolean;
  showNumbers: boolean;
}

export const THEME_PRESETS: Record<string, Omit<CalendarTheme, "preset" | "layout" | "backgroundImage">> = {
  christmas: {
    background: "linear-gradient(135deg,#7f1d1d 0%,#b91c1c 45%,#14532d 100%)",
    overlay: 0.15,
    primary: "#facc15",
    door: "#fef3c7",
    doorText: "#7f1d1d",
    text: "#ffffff",
    font: "festive",
    doorShape: "rounded",
    snow: true,
    showNumbers: true,
  },
  night: {
    background: "radial-gradient(circle at 20% 10%,#1e3a8a 0%,#0f172a 60%,#020617 100%)",
    overlay: 0.1,
    primary: "#fbbf24",
    door: "#1e293b",
    doorText: "#fde68a",
    text: "#f8fafc",
    font: "serif",
    doorShape: "rounded",
    snow: true,
    showNumbers: true,
  },
  frost: {
    background: "linear-gradient(160deg,#e0f2fe 0%,#bae6fd 40%,#f0f9ff 100%)",
    overlay: 0,
    primary: "#0284c7",
    door: "#ffffff",
    doorText: "#0369a1",
    text: "#0c4a6e",
    font: "sans",
    doorShape: "rounded",
    snow: true,
    showNumbers: true,
  },
  pastel: {
    background: "linear-gradient(135deg,#fce7f3 0%,#ede9fe 50%,#dcfce7 100%)",
    overlay: 0,
    primary: "#db2777",
    door: "#ffffff",
    doorText: "#9d174d",
    text: "#4c1d95",
    font: "handwritten",
    doorShape: "mixed",
    snow: false,
    showNumbers: true,
  },
  forest: {
    background: "linear-gradient(180deg,#052e16 0%,#14532d 60%,#166534 100%)",
    overlay: 0.1,
    primary: "#fca5a5",
    door: "#7c2d12",
    doorText: "#fef3c7",
    text: "#ecfccb",
    font: "festive",
    doorShape: "square",
    snow: true,
    showNumbers: true,
  },
  minimal: {
    background: "#fafaf9",
    overlay: 0,
    primary: "#dc2626",
    door: "#ffffff",
    doorText: "#1c1917",
    text: "#1c1917",
    font: "sans",
    doorShape: "square",
    snow: false,
    showNumbers: true,
  },
};

export const DEFAULT_THEME: CalendarTheme = {
  preset: "christmas",
  layout: "shuffle",
  backgroundImage: null,
  ...THEME_PRESETS.christmas,
};

export function normalizeTheme(value: unknown): CalendarTheme {
  if (!value || typeof value !== "object") return DEFAULT_THEME;
  return { ...DEFAULT_THEME, ...(value as Partial<CalendarTheme>) };
}

/** Effect played on the door itself when clicked. */
export const DOOR_ANIMATIONS = ["swing", "flip", "slide", "zoom", "shake", "gift", "unwrap"] as const;
/** Effect played when the content is revealed. */
export const OPEN_ANIMATIONS = ["confetti", "snow", "stars", "fade", "zoom", "fireworks", "none"] as const;

export type DoorAnimation = (typeof DOOR_ANIMATIONS)[number];
export type OpenAnimation = (typeof OPEN_ANIMATIONS)[number];

export const TIMEZONES = [
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Zurich",
  "Europe/London",
  "Europe/Lisbon",
  "America/Montreal",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Martinique",
  "America/Guadeloupe",
  "Indian/Reunion",
  "Pacific/Noumea",
  "Pacific/Tahiti",
  "Africa/Casablanca",
  "Africa/Abidjan",
  "Africa/Dakar",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

/** Deterministic shuffle so the "random" layout is stable for a calendar. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
