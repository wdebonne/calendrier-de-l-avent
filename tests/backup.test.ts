import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { containerKind, readContainer, writeContainer } from "@/lib/backup/container";

let dir: string;
beforeAll(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "advent-bk-"))));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const big = crypto.randomBytes(3_000_001);
const files: Record<string, Buffer> = {
  "manifest.json": Buffer.from('{"a":"é🎄"}'),
  "db/empty.ndjson": Buffer.alloc(0),
  "uploads/exact.bin": crypto.randomBytes(1024),
  "uploads/big.bin": big,
};
const entries = () =>
  Object.entries(files).map(([name, b]) => ({ name, size: b.length, content: b.length ? [b.subarray(0, 700), b.subarray(700)] : [] }));

async function readAll(file: string, password?: string) {
  const out: Record<string, Buffer> = {};
  await readContainer(
    file,
    async (e) => {
      const chunks: Buffer[] = [];
      for await (const c of e.content) chunks.push(Buffer.from(c));
      out[e.name] = Buffer.concat(chunks);
    },
    password,
  );
  return out;
}
const same = (out: Record<string, Buffer>) => {
  expect(Object.keys(out)).toEqual(Object.keys(files));
  for (const k of Object.keys(files)) expect(out[k].equals(files[k])).toBe(true);
};

describe("backup container", () => {
  it("round-trips a plain archive that standard tar can read", async () => {
    const f = path.join(dir, "plain.tar.gz");
    await writeContainer(f, entries());
    expect(await containerKind(f)).toBe("plain");
    same(await readAll(f));
    const list = execFileSync("tar", ["-tzf", "plain.tar.gz"], { cwd: dir }).toString().trim().split(/\r?\n/);
    expect(list).toEqual(Object.keys(files));
  });

  it("round-trips an encrypted archive and rejects bad passwords", async () => {
    const f = path.join(dir, "secret.avent");
    await writeContainer(f, entries(), "motdepasse é");
    expect(await containerKind(f)).toBe("encrypted");
    expect(fs.readFileSync(f).includes("manifest.json")).toBe(false);
    same(await readAll(f, "motdepasse é"));
    await expect(readAll(f)).rejects.toMatchObject({ code: "passwordRequired" });
    await expect(readAll(f, "autre")).rejects.toMatchObject({ code: "wrongPassword" });
  });

  it("detects truncated, altered and foreign files", async () => {
    for (const password of [undefined, "motdepasse"]) {
      const f = path.join(dir, `x-${password ?? "plain"}`);
      await writeContainer(f, entries(), password);
      const bytes = fs.readFileSync(f);
      const cut = `${f}-cut`;
      fs.writeFileSync(cut, bytes.subarray(0, bytes.length - 5000));
      await expect(readAll(cut, password)).rejects.toMatchObject({ code: "corrupted" });
      const altered = `${f}-alt`;
      bytes[Math.floor(bytes.length / 2)] ^= 0xff;
      fs.writeFileSync(altered, bytes);
      await expect(readAll(altered, password)).rejects.toMatchObject({ code: "corrupted" });
    }
    const foreign = path.join(dir, "foreign");
    fs.writeFileSync(foreign, "hello");
    await expect(readAll(foreign)).rejects.toMatchObject({ code: "invalidFile" });
  });

  it("can stop after the first entry", async () => {
    const f = path.join(dir, "plain.tar.gz");
    const seen: string[] = [];
    await readContainer(f, async (e) => {
      seen.push(e.name);
      return "stop";
    });
    expect(seen).toEqual(["manifest.json"]);
  });
});
