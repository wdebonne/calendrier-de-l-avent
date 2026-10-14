import { describe, expect, it } from "vitest";
import { dateRange, defaultAdventRange, isDayAvailable, todayInTimeZone } from "@/lib/calendar/dates";
import { parseChallenge, toPublicChallenge, unlockedHints, verifyAnswer, type Challenge } from "@/lib/challenges";
import { CHALLENGE_TEMPLATES } from "@/lib/challenges/templates";
import { blockDurationMinutes, evaluateIpRules, ipMatches, isValidCidr } from "@/lib/security/ip";
import { randomNumericSlug } from "@/lib/utils";

describe("dates", () => {
  it("computes today in the calendar time zone", () => {
    // 23:30 UTC on Nov 30 is already Dec 1 in Paris.
    const now = new Date("2026-11-30T23:30:00Z");
    expect(todayInTimeZone("Europe/Paris", now)).toBe("2026-12-01");
    expect(todayInTimeZone("America/New_York", now)).toBe("2026-11-30");
  });

  it("only opens days that have started in date mode", () => {
    const cal = { timezone: "Europe/Paris", unlock_mode: "date" as const };
    const now = new Date("2026-12-01T10:00:00Z");
    expect(isDayAvailable("2026-12-01", cal, now)).toBe(true);
    expect(isDayAvailable("2026-12-24", cal, now)).toBe(false);
    expect(isDayAvailable("2026-12-24", { ...cal, unlock_mode: "all" }, now)).toBe(true);
  });

  it("builds the default December 1-24 range", () => {
    const r = defaultAdventRange(new Date("2026-10-14T00:00:00Z"));
    expect(r).toEqual({ start: "2026-12-01", end: "2026-12-24" });
    expect(dateRange(r.start, r.end)).toHaveLength(24);
    expect(defaultAdventRange(new Date("2026-12-28T00:00:00Z")).start).toBe("2027-12-01");
  });
});

describe("challenges", () => {
  it("accepts riddle answers regardless of case and accents", () => {
    const c = parseChallenge({ type: "riddle", title: "", prompt: "", answers: ["Bonhomme de neige"], hints: [] })!;
    expect(verifyAnswer(c, "bonhomme de NEIGE")).toBe(true);
    expect(verifyAnswer(c, "  Le bonhomme de neige ")).toBe(true);
    expect(verifyAnswer(c, "sapin")).toBe(false);
    expect(verifyAnswer(c, "")).toBe(false);
  });

  it("verifies codes, choices, true/false and scrambles", () => {
    const code = parseChallenge({ type: "code", code: "2412", prompt: "", title: "" })!;
    expect(verifyAnswer(code, "2412")).toBe(true);
    expect(verifyAnswer(code, "1224")).toBe(false);
    const choice = parseChallenge({ type: "choice", options: ["a", "b"], correct: 1 })!;
    expect(verifyAnswer(choice, 1)).toBe(true);
    expect(verifyAnswer(choice, 0)).toBe(false);
    const tf = parseChallenge({ type: "truefalse", items: [{ text: "x", answer: true }, { text: "y", answer: false }] })!;
    expect(verifyAnswer(tf, [true, false])).toBe(true);
    expect(verifyAnswer(tf, [true, true])).toBe(false);
    const sc = parseChallenge({ type: "scramble", word: "Guirlande" })!;
    expect(verifyAnswer(sc, "GUIRLANDE")).toBe(true);
  });

  it("never leaks answers in the public payload", () => {
    for (const t of CHALLENGE_TEMPLATES) {
      for (const c of [t.challenge.fr, t.challenge.en] as Challenge[]) {
        expect(parseChallenge(c)).not.toBeNull();
        const json = JSON.stringify(toPublicChallenge(c, "seed"));
        expect(json).not.toMatch(/"(answers|code|correct|word|answer)":/);
      }
    }
  });

  it("scrambles letters deterministically", () => {
    const c = parseChallenge({ type: "scramble", word: "SAPIN" })!;
    const a = toPublicChallenge(c, "day-1");
    const b = toPublicChallenge(c, "day-1");
    expect(a).toEqual(b);
    if (a.type === "scramble") expect([...a.letters].sort().join("")).toBe("AINPS");
  });

  it("unlocks hints by attempts or time", () => {
    const hints = [{ text: "a", afterAttempts: 1 }, { text: "b", afterAttempts: 3, afterSeconds: 60 }, { text: "c" }];
    expect(unlockedHints(hints, 0, 0)).toEqual([2]);
    expect(unlockedHints(hints, 1, 0)).toEqual([0, 2]);
    expect(unlockedHints(hints, 1, 61)).toEqual([0, 1, 2]);
  });
});

describe("ip rules", () => {
  it("matches IPv4 and IPv6 CIDRs", () => {
    expect(ipMatches("192.168.1.42", "192.168.1.0/24")).toBe(true);
    expect(ipMatches("192.168.2.1", "192.168.1.0/24")).toBe(false);
    expect(ipMatches("::ffff:10.0.0.5", "10.0.0.0/8")).toBe(true);
    expect(ipMatches("2001:db8::1", "2001:db8::/32")).toBe(true);
    expect(ipMatches("2001:db9::1", "2001:db8::/32")).toBe(false);
    expect(ipMatches("8.8.8.8", "8.8.8.8")).toBe(true);
    expect(isValidCidr("10.0.0.0/33")).toBe(false);
    expect(isValidCidr("not-an-ip")).toBe(false);
  });

  it("lets the allow list win over the deny list", () => {
    const rules = [
      { cidr: "10.0.0.0/8", type: "deny" as const },
      { cidr: "10.1.2.3", type: "allow" as const },
    ];
    expect(evaluateIpRules("10.1.2.3", rules)).toBe("allow");
    expect(evaluateIpRules("10.9.9.9", rules)).toBe("deny");
    expect(evaluateIpRules("1.1.1.1", rules)).toBe("neutral");
  });

  it("grows block duration progressively", () => {
    expect(blockDurationMinutes(15, 0, true)).toBe(15);
    expect(blockDurationMinutes(15, 2, true)).toBe(60);
    expect(blockDurationMinutes(15, 20, true)).toBe(1440);
    expect(blockDurationMinutes(15, 3, false)).toBe(15);
  });
});

describe("slugs", () => {
  it("generates non-sequential numeric slugs", () => {
    const s = randomNumericSlug(10);
    expect(s).toMatch(/^[1-9]\d{9}$/);
    expect(new Set(Array.from({ length: 50 }, () => randomNumericSlug())).size).toBe(50);
  });
});
