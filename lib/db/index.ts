import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Kysely, PostgresDialect, SqliteDialect } from "kysely";
import SQLite from "better-sqlite3";
import pg from "pg";
import { DATA_DIR } from "@/lib/env";
import { decrypt } from "@/lib/crypto";
import { migrateToLatest } from "./migrations";
import type { Database } from "./types";

export type DbEngine = "sqlite" | "postgres";

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

export interface DbConfig {
  engine: DbEngine;
  /** Where the active configuration comes from. */
  source: "env" | "file" | "default";
  sqlitePath: string;
  postgres?: PostgresConfig;
  connectionString?: string;
}

export const SQLITE_PATH = path.join(DATA_DIR, "app.db");
export const DB_CONFIG_FILE = path.join(DATA_DIR, "db-config.json");

export function resolveDbConfig(): DbConfig {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    return { engine: "postgres", source: "env", sqlitePath: SQLITE_PATH, connectionString: url };
  }
  if (fs.existsSync(DB_CONFIG_FILE)) {
    try {
      const file = JSON.parse(fs.readFileSync(DB_CONFIG_FILE, "utf8"));
      if (file.engine === "postgres" && file.postgres) {
        const postgres = { ...file.postgres, password: decrypt(file.postgres.password) ?? file.postgres.password };
        return { engine: "postgres", source: "file", sqlitePath: SQLITE_PATH, postgres };
      }
    } catch (e) {
      console.error("[db] invalid db-config.json, falling back to SQLite", e);
    }
  }
  return { engine: "sqlite", source: "default", sqlitePath: SQLITE_PATH };
}

export function createPostgresDb(cfg: { postgres?: PostgresConfig; connectionString?: string }) {
  const pool = new pg.Pool(
    cfg.connectionString
      ? { connectionString: cfg.connectionString, max: 10 }
      : {
          host: cfg.postgres!.host,
          port: cfg.postgres!.port,
          database: cfg.postgres!.database,
          user: cfg.postgres!.user,
          password: cfg.postgres!.password,
          ssl: cfg.postgres!.ssl ? { rejectUnauthorized: false } : undefined,
          max: 10,
          connectionTimeoutMillis: 8000,
        },
  );
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

export function createSqliteDb(file = SQLITE_PATH) {
  const sqlite = new SQLite(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
}

type DbState = { db: Kysely<Database>; config: DbConfig; ready: Promise<void> };

const globalForDb = globalThis as unknown as { __advent_db?: DbState };

function init(): DbState {
  const config = resolveDbConfig();
  const db = config.engine === "postgres" ? createPostgresDb(config) : createSqliteDb(config.sqlitePath);
  const ready = (async () => {
    await migrateToLatest(db);
    const { bootstrapFromEnv } = await import("./bootstrap");
    await bootstrapFromEnv(db);
    console.log(`[db] ready (${config.engine}, source=${config.source})`);
  })();
  return { db, config, ready };
}

/** Returns the migrated database instance (SQLite or PostgreSQL depending on configuration). */
export async function getDb(): Promise<Kysely<Database>> {
  if (!globalForDb.__advent_db) globalForDb.__advent_db = init();
  await globalForDb.__advent_db.ready;
  return globalForDb.__advent_db.db;
}

export function currentDbConfig(): DbConfig {
  if (!globalForDb.__advent_db) globalForDb.__advent_db = init();
  return globalForDb.__advent_db.config;
}
