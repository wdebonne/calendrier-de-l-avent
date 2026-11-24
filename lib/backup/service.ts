import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Kysely, Transaction } from "kysely";
import { decrypt, encrypt } from "@/lib/crypto";
import { currentDbConfig, getDb } from "@/lib/db";
import { TABLE_ORDER, type Database } from "@/lib/db/types";
import { BACKUP_DIR, UPLOAD_DIR } from "@/lib/env";
import { MEDIA_TYPES } from "@/lib/media-types";
import { evaluateIpRules } from "@/lib/security/ip";
import { invalidateIpRules } from "@/lib/security/guard";
import { getSetting } from "@/lib/settings";
import { nowIso } from "@/lib/utils";
import { BackupError, containerKind, readContainer, writeContainer } from "./container";
import type { TarInput } from "./tar";

const FORMAT = "advent-backup";
const VERSION = 1;
const SAFETY_KEPT = 3;

// Temporary security state (open sessions, reset links, failed attempts, blocks) is not backed up.
const SKIPPED: (keyof Database)[] = ["sessions", "password_resets", "login_attempts", "ip_blocks"];
const TABLES = TABLE_ORDER.filter((t) => !SKIPPED.includes(t));

export interface BackupManifest {
  format: string;
  version: number;
  createdAt: string;
  appName: string;
  engine: string;
  migrations: string[];
  tables: Record<string, number>;
  media: { files: number; bytes: number; missing: number };
  /** Uncompressed size, used to check the free space before restoring. */
  totalBytes: number;
}

export interface BackupInfo {
  name: string;
  kind: "manual" | "safety" | "import";
  encrypted: boolean;
  size: number;
  createdAt: string;
  manifest: BackupManifest | null;
}

export type Progress = (phase: "database" | "files" | "safety" | "verify" | "apply", done: number, total: number) => void;

export interface RestoreResult {
  safetyName: string;
  tables: Record<string, number>;
  mediaFiles: number;
  missingMedia: number;
  smtpPasswordLost: boolean;
  ipRulesRemoved: number;
}

const NAME_RE = /^(sauvegarde|securite|import)-\d{8}-\d{6}-[0-9a-f]{6}\.(tar\.gz|avent)$/;
const MEDIA_FILE_RE = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

const inBackups = (name: string) => path.join(/*turbopackIgnore: true*/ BACKUP_DIR, name);
const inUploads = (name: string) => path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name);

export function backupPath(name: string): string {
  if (!NAME_RE.test(name)) throw new BackupError("notFound");
  const file = inBackups(name);
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) throw new BackupError("notFound");
  return file;
}

export function newBackupName(kind: "sauvegarde" | "securite" | "import", encrypted: boolean): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  return `${kind}-${stamp}-${crypto.randomBytes(3).toString("hex")}.${encrypted ? "avent" : "tar.gz"}`;
}

async function ensureSpace(needed: number) {
  const s = await fs.promises.statfs(BACKUP_DIR);
  // Keep a margin so the database itself never runs out of room.
  if (s.bavail * s.bsize < needed + 50 * 1024 * 1024) throw new BackupError("noSpace");
}

function makeWorkDir(): string {
  // Leftovers of an operation interrupted by a restart.
  for (const name of fs.readdirSync(BACKUP_DIR)) {
    if (!name.startsWith(".work-") && !name.startsWith(".import-")) continue;
    const file = inBackups(name);
    if (Date.now() - fs.statSync(file).mtimeMs > 24 * 3600_000) fs.rmSync(file, { recursive: true, force: true });
  }
  const dir = inBackups(`.work-${crypto.randomBytes(6).toString("hex")}`);
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  return dir;
}

async function appliedMigrations(db: Kysely<Database>): Promise<string[]> {
  const rows = await (db as unknown as Kysely<{ kysely_migration: { name: string } }>)
    .selectFrom("kysely_migration")
    .select("name")
    .orderBy("name")
    .execute();
  return rows.map((r) => r.name);
}

// ------------------------------------------------------------------ Create

async function dumpTables(dir: string): Promise<Record<string, number>> {
  const db = await getDb();
  const counts: Record<string, number> = {};
  const dump = async (trx: Transaction<Database>) => {
    for (const table of TABLES) {
      const key = table === "settings" ? "key" : "id";
      const out = fs.createWriteStream(path.join(/*turbopackIgnore: true*/ dir, `${table}.ndjson`), { mode: 0o600 });
      let count = 0;
      const rows = async function* () {
        let last: string | null = null;
        for (;;) {
          let q = trx.selectFrom(table as "users").selectAll().orderBy(key as "id").limit(1000);
          if (last !== null) q = q.where(key as "id", ">", last);
          const batch = (await q.execute()) as unknown as Record<string, unknown>[];
          if (!batch.length) return;
          count += batch.length;
          last = String(batch[batch.length - 1][key]);
          yield Buffer.from(batch.map((r) => JSON.stringify(r) + "\n").join(""));
        }
      };
      await pipeline(Readable.from(rows(), { objectMode: false }), out);
      counts[table] = count;
    }
  };
  // One transaction, so all the tables are seen at the same instant.
  const trx = db.transaction();
  if (currentDbConfig().engine === "postgres") await trx.setIsolationLevel("repeatable read").execute(dump);
  else await trx.execute(dump);
  return counts;
}

export async function createBackup(
  kind: "sauvegarde" | "securite",
  opts: { password?: string; onProgress?: Progress } = {},
): Promise<string> {
  const work = makeWorkDir();
  const name = newBackupName(kind, !!opts.password);
  const target = inBackups(name);
  const part = path.join(/*turbopackIgnore: true*/ work, "archive.part");
  const phase = kind === "securite" ? "safety" : "files";
  try {
    opts.onProgress?.(kind === "securite" ? "safety" : "database", 0, 0);
    const db = await getDb();
    const tables = await dumpTables(work);

    const media: { filename: string; size: number }[] = [];
    let missing = 0;
    for (const row of await db.selectFrom("media").select("filename").execute()) {
      const stat = MEDIA_FILE_RE.test(row.filename) ? await fs.promises.stat(inUploads(row.filename)).catch(() => null) : null;
      if (stat?.isFile()) media.push({ filename: row.filename, size: stat.size });
      else missing++;
    }
    const mediaBytes = media.reduce((a, m) => a + m.size, 0);
    const dumps = TABLES.map((t) => {
      const file = path.join(/*turbopackIgnore: true*/ work, `${t}.ndjson`);
      return { table: t, file, size: fs.statSync(/*turbopackIgnore: true*/ file).size };
    });
    const totalBytes = mediaBytes + dumps.reduce((a, d) => a + d.size, 0);
    await ensureSpace(totalBytes);

    const manifest: BackupManifest = {
      format: FORMAT,
      version: VERSION,
      createdAt: nowIso(),
      appName: (await getSetting("general")).appName,
      engine: currentDbConfig().engine,
      migrations: await appliedMigrations(db),
      tables,
      media: { files: media.length, bytes: mediaBytes, missing },
      totalBytes,
    };

    const small = (entryName: string, value: unknown): TarInput => {
      const b = Buffer.from(JSON.stringify(value, null, 2));
      return { name: entryName, size: b.length, content: [b] };
    };
    const smtpPassword = opts.password ? (await getSetting("smtp")).password : "";
    let done = 0;
    const entries = async function* (): AsyncGenerator<TarInput> {
      yield small("manifest.json", manifest);
      // In the database this password is tied to the server's secret. It only travels in readable
      // form inside a password-protected backup.
      if (smtpPassword) yield small("secrets.json", { smtpPassword });
      for (const d of dumps) yield { name: `db/${d.table}.ndjson`, size: d.size, content: fileChunks(d.file, d.size) };
      for (const m of media) {
        yield { name: `uploads/${m.filename}`, size: m.size, content: fileChunks(inUploads(m.filename), m.size) };
        done += m.size;
        opts.onProgress?.(phase, done, mediaBytes);
      }
    };
    await writeContainer(part, entries(), opts.password);
    fs.renameSync(part, target);
    return name;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOSPC") throw new BackupError("noSpace");
    throw e;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function fileChunks(file: string, size: number): AsyncIterable<Buffer> | Iterable<Buffer> {
  return size ? (fs.createReadStream(file, { end: size - 1 }) as AsyncIterable<Buffer>) : [];
}

// ------------------------------------------------------------------ List

async function readText(content: AsyncIterable<Buffer>, size: number): Promise<string> {
  if (size > 1024 * 1024) throw new BackupError("invalidFile");
  const chunks: Buffer[] = [];
  for await (const c of content) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

function parseManifest(text: string): BackupManifest {
  let m: BackupManifest;
  try {
    m = JSON.parse(text);
  } catch {
    throw new BackupError("invalidFile");
  }
  const valid =
    m?.format === FORMAT &&
    Number.isInteger(m.version) &&
    Array.isArray(m.migrations) &&
    m.tables &&
    typeof m.tables === "object" &&
    Number.isSafeInteger(m.totalBytes) &&
    Number.isSafeInteger(m.media?.files);
  if (!valid) throw new BackupError("invalidFile");
  if (m.version > VERSION) throw new BackupError("newerVersion");
  return m;
}

/** Manifest of an unencrypted backup: it is the first entry, so this is quick even for a large file. */
export async function readManifest(file: string): Promise<BackupManifest> {
  let manifest: BackupManifest | null = null;
  await readContainer(file, async (e) => {
    if (e.name !== "manifest.json") throw new BackupError("invalidFile");
    manifest = parseManifest(await readText(e.content, e.size));
    return "stop";
  });
  if (!manifest) throw new BackupError("invalidFile");
  return manifest;
}

export async function listBackups(): Promise<BackupInfo[]> {
  const out: BackupInfo[] = [];
  for (const name of fs.readdirSync(BACKUP_DIR).filter((n) => NAME_RE.test(n))) {
    const file = inBackups(name);
    const stat = fs.statSync(/*turbopackIgnore: true*/ file);
    const encrypted = name.endsWith(".avent");
    out.push({
      name,
      kind: name.startsWith("securite") ? "safety" : name.startsWith("import") ? "import" : "manual",
      encrypted,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
      manifest: encrypted ? null : await readManifest(file).catch(() => null),
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteBackup(name: string) {
  fs.rmSync(backupPath(name));
}

/** Stores an uploaded backup after checking that it is one. */
export async function importBackup(body: ReadableStream<Uint8Array>, declaredSize: number): Promise<string> {
  await ensureSpace(declaredSize);
  const tmp = inBackups(`.import-${crypto.randomBytes(6).toString("hex")}`);
  try {
    await pipeline(Readable.fromWeb(body as never), fs.createWriteStream(tmp, { mode: 0o600 }));
    const kind = await containerKind(tmp);
    if (!kind) throw new BackupError("invalidFile");
    if (kind === "plain") await readManifest(tmp);
    const name = newBackupName("import", kind === "encrypted");
    fs.renameSync(tmp, inBackups(name));
    return name;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOSPC") throw new BackupError("noSpace");
    throw e;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// ------------------------------------------------------------------ Restore

async function* readRows(file: string): AsyncGenerator<Record<string, unknown>> {
  // Not readline: it also splits on U+2028, which JSON leaves as is inside texts.
  const input = fs.createReadStream(file, { encoding: "utf8" });
  let rest = "";
  for await (const chunk of input) {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop()!;
    for (const line of lines) yield JSON.parse(line);
  }
  if (rest) yield JSON.parse(rest);
}

/** Extracts and checks the whole backup in a staging folder. Nothing is applied here. */
async function extract(file: string, work: string, password: string | undefined, onProgress?: Progress) {
  let manifest: BackupManifest | null = null;
  let secrets: { smtpPassword?: string } = {};
  const uploads = path.join(/*turbopackIgnore: true*/ work, "uploads");
  fs.mkdirSync(/*turbopackIgnore: true*/ uploads);
  const staged = new Map<string, number>();
  let done = 0;

  await readContainer(
    file,
    async (e) => {
      if (!manifest) {
        if (e.name !== "manifest.json") throw new BackupError("invalidFile");
        manifest = parseManifest(await readText(e.content, e.size));
        const db = await getDb();
        const known = new Set(await appliedMigrations(db));
        if (manifest.migrations.some((m) => !known.has(m))) throw new BackupError("newerVersion");
        // Staging copy + safety backup of the current data.
        const current = await db.selectFrom("media").select((eb) => eb.fn.sum<number>("size").as("n")).executeTakeFirst();
        await ensureSpace(manifest.totalBytes + Number(current?.n ?? 0));
        return;
      }
      if (e.name === "secrets.json") {
        secrets = JSON.parse(await readText(e.content, e.size));
        return;
      }
      done += e.size;
      if (done > manifest.totalBytes) throw new BackupError("corrupted");
      const [folder, base, extra] = e.name.split("/");
      let target: string;
      if (extra === undefined && folder === "db" && TABLES.some((t) => base === `${t}.ndjson`)) {
        target = path.join(/*turbopackIgnore: true*/ work, base);
      } else if (extra === undefined && folder === "uploads" && MEDIA_FILE_RE.test(base ?? "")) {
        target = path.join(/*turbopackIgnore: true*/ uploads, base);
        staged.set(base, e.size);
      } else {
        throw new BackupError("invalidFile");
      }
      await pipeline(Readable.from(e.content, { objectMode: false }), fs.createWriteStream(target, { mode: 0o600 }));
      onProgress?.("verify", done, manifest.totalBytes);
    },
    password,
  );
  if (!manifest) throw new BackupError("invalidFile");
  return { manifest: manifest as BackupManifest, secrets, staged, uploads };
}

async function validateRows(work: string, manifest: BackupManifest) {
  const db = await getDb();
  const columns = new Map((await db.introspection.getTables()).map((t) => [t.name, new Set(t.columns.map((c) => c.name))]));
  let activeAdmin = false;
  for (const table of TABLES) {
    const file = path.join(/*turbopackIgnore: true*/ work, `${table}.ndjson`);
    if (!fs.existsSync(/*turbopackIgnore: true*/ file)) throw new BackupError("corrupted");
    const known = columns.get(table);
    let count = 0;
    try {
      for await (const row of readRows(file)) {
        count++;
        for (const [k, v] of Object.entries(row)) {
          if (!known?.has(k)) throw new BackupError("newerVersion");
          if (v !== null && typeof v !== "string" && typeof v !== "number") throw new BackupError("corrupted");
        }
        if (table === "users" && row.role === "admin" && row.active) activeAdmin = true;
        // Media is served with its stored type: only accept what uploads accept.
        if (table === "media" && (!MEDIA_FILE_RE.test(String(row.filename)) || !(String(row.mime) in MEDIA_TYPES))) {
          throw new BackupError("corrupted");
        }
      }
    } catch (e) {
      throw e instanceof BackupError ? e : new BackupError("corrupted", (e as Error).message);
    }
    if (count !== manifest.tables[table]) throw new BackupError("corrupted");
  }
  // Without one, nobody could sign in after the restore.
  if (!activeAdmin) throw new BackupError("noAdmin");
}

async function applyRows(trx: Transaction<Database>, work: string, secrets: { smtpPassword?: string }, adminIp: string) {
  await trx.deleteFrom("sessions").execute();
  await trx.deleteFrom("password_resets").execute();
  for (const table of [...TABLES].reverse()) await trx.deleteFrom(table).execute();
  for (const table of TABLES) {
    let chunk: Record<string, unknown>[] = [];
    const flush = async () => {
      if (chunk.length) await trx.insertInto(table).values(chunk as never).execute();
      chunk = [];
    };
    for await (const row of readRows(path.join(/*turbopackIgnore: true*/ work, `${table}.ndjson`))) {
      chunk.push(row);
      if (chunk.length >= 200) await flush();
    }
    await flush();
  }

  // The SMTP password is encrypted with the secret of the server that made the backup.
  let smtpPasswordLost = false;
  const smtp = await trx.selectFrom("settings").select("value").where("key", "=", "smtp").executeTakeFirst();
  if (smtp) {
    const value = JSON.parse(smtp.value);
    if (value.password && decrypt(value.password) === null) {
      value.password = secrets.smtpPassword ? encrypt(secrets.smtpPassword) : "";
      smtpPasswordLost = !secrets.smtpPassword;
      await trx.updateTable("settings").set({ value: JSON.stringify(value) }).where("key", "=", "smtp").execute();
    }
  }

  // Never lock out the administrator who is restoring.
  let ipRulesRemoved = 0;
  const rules = await trx.selectFrom("ip_rules").selectAll().execute();
  if (evaluateIpRules(adminIp, rules) === "deny") {
    for (const r of rules.filter((x) => x.type === "deny" && evaluateIpRules(adminIp, [x]) === "deny")) {
      await trx.deleteFrom("ip_rules").where("id", "=", r.id).execute();
      ipRulesRemoved++;
    }
  }
  return { smtpPasswordLost, ipRulesRemoved };
}

export async function restoreBackup(
  name: string,
  opts: { password?: string; adminIp: string; onProgress?: Progress },
): Promise<RestoreResult> {
  const file = backupPath(name);
  const work = makeWorkDir();
  // Files put in place before the database switch, to undo if it fails.
  const added: string[] = [];
  const replaced: { file: string; saved: string }[] = [];
  try {
    opts.onProgress?.("verify", 0, 0);
    const { manifest, secrets, staged, uploads } = await extract(file, work, opts.password, opts.onProgress);
    if (staged.size !== manifest.media.files) throw new BackupError("corrupted");
    await validateRows(work, manifest);

    const safetyName = await createBackup("securite", { onProgress: opts.onProgress });

    opts.onProgress?.("apply", 0, 0);
    const db = await getDb();
    const before = await db.selectFrom("media").select("filename").execute();
    let result: { smtpPasswordLost: boolean; ipRulesRemoved: number };
    try {
      // Media names are unique ids: adding them first is harmless, even if interrupted here.
      for (const [filename, size] of staged) {
        const target = inUploads(filename);
        const existing = await fs.promises.stat(target).catch(() => null);
        if (existing?.size === size) continue;
        if (existing) {
          const saved = path.join(/*turbopackIgnore: true*/ work, `old-${filename}`);
          fs.renameSync(target, saved);
          replaced.push({ file: target, saved });
        } else added.push(target);
        fs.renameSync(path.join(/*turbopackIgnore: true*/ uploads, filename), target);
      }
      // All or nothing: any error leaves the current database untouched.
      result = await db.transaction().execute((trx) => applyRows(trx, work, secrets, opts.adminIp));
    } catch (e) {
      for (const f of added) fs.rmSync(f, { force: true });
      for (const r of replaced) fs.renameSync(r.saved, r.file);
      throw e;
    }
    // The data is restored from here on: cleaning up must not report a failure.
    try {
      invalidateIpRules();
      // Files of media that no longer exist (they are in the safety backup).
      const kept = new Set((await db.selectFrom("media").select("filename").execute()).map((m) => m.filename));
      for (const m of before) {
        if (!kept.has(m.filename) && MEDIA_FILE_RE.test(m.filename)) fs.rmSync(inUploads(m.filename), { force: true });
      }
      pruneSafety(name);
    } catch (e) {
      console.error("[backup] cleanup after restore:", e);
    }
    return { safetyName, tables: manifest.tables, mediaFiles: staged.size, missingMedia: manifest.media.missing, ...result };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Keeps the latest automatic backups only, and never the one just restored. */
function pruneSafety(justRestored: string) {
  const safety = fs
    .readdirSync(BACKUP_DIR)
    .filter((n) => NAME_RE.test(n) && n.startsWith("securite-"))
    .sort()
    .reverse();
  for (const n of safety.slice(SAFETY_KEPT)) if (n !== justRestored) fs.rmSync(inBackups(n), { force: true });
}
