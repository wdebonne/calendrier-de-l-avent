// Pure IP helpers (IPv4 / IPv6 / CIDR), no server dependencies so they can be unit tested.

function parseIpv4(ip: string): bigint | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = BigInt(0);
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << BigInt(8)) + BigInt(v);
  }
  return n;
}

function parseIpv6(ip: string): bigint | null {
  let addr = ip.toLowerCase();
  const zone = addr.indexOf("%");
  if (zone >= 0) addr = addr.slice(0, zone);
  // Embedded IPv4 (e.g. ::ffff:1.2.3.4)
  const lastColon = addr.lastIndexOf(":");
  const tail = addr.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (v4 === null) return null;
    addr = `${addr.slice(0, lastColon + 1)}${((v4 >> BigInt(16)) & BigInt(0xffff)).toString(16)}:${(v4 & BigInt(0xffff)).toString(16)}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 && head.length !== 8) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  let n = BigInt(0);
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    n = (n << BigInt(16)) + BigInt(parseInt(g, 16));
  }
  return n;
}

export interface ParsedIp {
  version: 4 | 6;
  value: bigint;
}

/** Normalises an address; IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are returned as IPv4. */
export function parseIp(ip: string): ParsedIp | null {
  const trimmed = ip.trim();
  const v4 = parseIpv4(trimmed);
  if (v4 !== null) return { version: 4, value: v4 };
  const v6 = parseIpv6(trimmed);
  if (v6 === null) return null;
  if (v6 >> BigInt(32) === BigInt(0xffff)) return { version: 4, value: v6 & BigInt(0xffffffff) };
  return { version: 6, value: v6 };
}

export function isValidCidr(cidr: string): boolean {
  const [addr, bits] = cidr.trim().split("/");
  const ip = parseIp(addr);
  if (!ip) return false;
  if (bits === undefined) return true;
  if (!/^\d{1,3}$/.test(bits)) return false;
  return Number(bits) <= (ip.version === 4 ? 32 : 128);
}

export function ipMatches(ip: string, cidr: string): boolean {
  const target = parseIp(ip);
  const [addr, bitsRaw] = cidr.trim().split("/");
  const base = parseIp(addr);
  if (!target || !base || target.version !== base.version) return false;
  const total = target.version === 4 ? 32 : 128;
  const bits = bitsRaw === undefined ? total : Number(bitsRaw);
  if (Number.isNaN(bits) || bits < 0 || bits > total) return false;
  if (bits === 0) return true;
  const shift = BigInt(total - bits);
  return target.value >> shift === base.value >> shift;
}

export type IpDecision = "allow" | "deny" | "neutral";

/** Allow rules win over deny rules so an admin can never lock out a whitelisted address. */
export function evaluateIpRules(ip: string, rules: { cidr: string; type: "allow" | "deny" }[]): IpDecision {
  if (rules.some((r) => r.type === "allow" && ipMatches(ip, r.cidr))) return "allow";
  if (rules.some((r) => r.type === "deny" && ipMatches(ip, r.cidr))) return "deny";
  return "neutral";
}

/** Block duration with optional exponential growth for repeat offenders (capped at 24h). */
export function blockDurationMinutes(base: number, previousBlocks: number, progressive: boolean): number {
  if (!progressive) return base;
  return Math.min(base * 2 ** previousBlocks, 24 * 60);
}
