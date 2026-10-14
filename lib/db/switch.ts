import "server-only";
import fs from "node:fs";
import { sql } from "kysely";
import { createPostgresDb, currentDbConfig, DB_CONFIG_FILE, getDb, type PostgresConfig } from "./index";
import { migrateToLatest } from "./migrations";
import { TABLE_ORDER, type Database } from "./types";
import { encrypt, decrypt } from "@/lib/crypto";

export async function testPostgres(cfg: PostgresConfig): Promise<string> {
  const db = createPostgresDb({ postgres: cfg });
  try {
    const r = await sql<{ version: string }>`select version() as version`.execute(db);
    return r.rows[0]?.version.split(" ").slice(0, 2).join(" ") ?? "PostgreSQL";
  } finally {
    await db.destroy();
  }
}

/**
 * Creates the schema on the target PostgreSQL database and copies every row from the current
 * database inside a single transaction. Existing rows in the target are replaced.
 */
export async function copyToPostgres(cfg: PostgresConfig): Promise<number> {
  const source = await getDb();
  const target = createPostgresDb({ postgres: cfg });
  let total = 0;
  try {
    await migrateToLatest(target);
    await target.transaction().execute(async (trx) => {
      for (const table of [...TABLE_ORDER].reverse()) {
        await trx.deleteFrom(table).execute();
      }
      for (const table of TABLE_ORDER) {
        const rows = (await source.selectFrom(table).selectAll().execute()) as Record<string, unknown>[];
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          if (chunk.length) await trx.insertInto(table as keyof Database).values(chunk as never).execute();
        }
        total += rows.length;
      }
    });
    // Verify row counts match.
    for (const table of TABLE_ORDER) {
      const [a, b] = await Promise.all([
        source.selectFrom(table).select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst(),
        target.selectFrom(table).select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst(),
      ]);
      if (Number(a?.n) !== Number(b?.n)) throw new Error(`Row count mismatch on ${table}`);
    }
  } finally {
    await target.destroy();
  }
  return total;
}

/** Persists the PostgreSQL configuration (password encrypted) so the next start uses it. */
export function writePostgresConfig(cfg: PostgresConfig) {
  fs.writeFileSync(
    DB_CONFIG_FILE,
    JSON.stringify({ engine: "postgres", postgres: { ...cfg, password: encrypt(cfg.password) }, savedAt: new Date().toISOString() }, null, 2),
    { mode: 0o600 },
  );
}

export function removeDbConfig() {
  if (fs.existsSync(DB_CONFIG_FILE)) fs.renameSync(DB_CONFIG_FILE, `${DB_CONFIG_FILE}.bak`);
}

/** Saved PostgreSQL settings (password decrypted) to prefill the admin form. */
export function readSavedPostgres(): PostgresConfig | null {
  for (const file of [DB_CONFIG_FILE, `${DB_CONFIG_FILE}.bak`]) {
    if (!fs.existsSync(/*turbopackIgnore: true*/ file)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8"));
      if (json.postgres) return { ...json.postgres, password: decrypt(json.postgres.password) ?? json.postgres.password };
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function tableCounts(): Promise<Record<string, number>> {
  const db = await getDb();
  const out: Record<string, number> = {};
  for (const table of ["users", "calendars", "days", "media", "visits", "day_events"] as const) {
    const r = await db.selectFrom(table).select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst();
    out[table] = Number(r?.n ?? 0);
  }
  return out;
}

export { currentDbConfig };
