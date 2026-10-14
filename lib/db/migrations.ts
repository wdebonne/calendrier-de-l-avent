import type { Kysely } from "kysely";
import { type Migration, type MigrationProvider, Migrator } from "kysely/migration";

// Migrations only use portable column types (text / integer) so they run unchanged
// on SQLite and PostgreSQL.

const migrations: Record<string, Migration> = {
  "001_initial": {
    async up(db: Kysely<any>) {
      await db.schema
        .createTable("users")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("email", "text", (c) => c.notNull().unique())
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("password_hash", "text", (c) => c.notNull())
        .addColumn("role", "text", (c) => c.notNull())
        .addColumn("active", "integer", (c) => c.notNull().defaultTo(1))
        .addColumn("locale", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("last_login_at", "text")
        .execute();

      await db.schema
        .createTable("sessions")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("user_id", "text", (c) => c.notNull().references("users.id").onDelete("cascade"))
        .addColumn("expires_at", "text", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("ip", "text")
        .addColumn("user_agent", "text")
        .execute();

      await db.schema
        .createTable("password_resets")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("user_id", "text", (c) => c.notNull().references("users.id").onDelete("cascade"))
        .addColumn("expires_at", "text", (c) => c.notNull())
        .addColumn("used_at", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("settings")
        .addColumn("key", "text", (c) => c.primaryKey())
        .addColumn("value", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("media")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("owner_id", "text", (c) => c.notNull().references("users.id").onDelete("cascade"))
        .addColumn("filename", "text", (c) => c.notNull())
        .addColumn("original_name", "text", (c) => c.notNull())
        .addColumn("mime", "text", (c) => c.notNull())
        .addColumn("size", "integer", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("calendars")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("owner_id", "text", (c) => c.notNull().references("users.id").onDelete("cascade"))
        .addColumn("title", "text", (c) => c.notNull())
        .addColumn("description", "text")
        .addColumn("slug", "text", (c) => c.notNull().unique())
        .addColumn("start_date", "text", (c) => c.notNull())
        .addColumn("end_date", "text", (c) => c.notNull())
        .addColumn("timezone", "text", (c) => c.notNull())
        .addColumn("theme", "text", (c) => c.notNull())
        .addColumn("door_animation", "text", (c) => c.notNull())
        .addColumn("open_animation", "text", (c) => c.notNull())
        .addColumn("unlock_mode", "text", (c) => c.notNull())
        .addColumn("password_hash", "text")
        .addColumn("published", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("qr_config", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("days")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("calendar_id", "text", (c) => c.notNull().references("calendars.id").onDelete("cascade"))
        .addColumn("date", "text", (c) => c.notNull())
        .addColumn("position", "integer", (c) => c.notNull())
        .addColumn("label", "text")
        .addColumn("cover_url", "text")
        .addColumn("content_type", "text", (c) => c.notNull())
        .addColumn("content_url", "text")
        .addColumn("content_text", "text")
        .addColumn("open_animation", "text")
        .addColumn("challenge", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("days_calendar_idx").on("days").columns(["calendar_id", "date"]).execute();

      await db.schema
        .createTable("visits")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("calendar_id", "text", (c) => c.notNull().references("calendars.id").onDelete("cascade"))
        .addColumn("visitor_id", "text", (c) => c.notNull())
        .addColumn("ip_hash", "text")
        .addColumn("user_agent", "text")
        .addColumn("referrer", "text")
        .addColumn("source", "text", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("visits_calendar_idx").on("visits").columns(["calendar_id", "created_at"]).execute();

      await db.schema
        .createTable("day_events")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("calendar_id", "text", (c) => c.notNull().references("calendars.id").onDelete("cascade"))
        .addColumn("day_id", "text", (c) => c.notNull().references("days.id").onDelete("cascade"))
        .addColumn("visitor_id", "text", (c) => c.notNull())
        .addColumn("type", "text", (c) => c.notNull())
        .addColumn("payload", "text")
        .addColumn("duration_ms", "integer")
        .addColumn("created_at", "text", (c) => c.notNull())
        .execute();
      await db.schema
        .createIndex("day_events_calendar_idx")
        .on("day_events")
        .columns(["calendar_id", "created_at"])
        .execute();
      await db.schema
        .createIndex("day_events_visitor_idx")
        .on("day_events")
        .columns(["day_id", "visitor_id", "type"])
        .execute();

      await db.schema
        .createTable("login_attempts")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("ip", "text", (c) => c.notNull())
        .addColumn("identifier", "text")
        .addColumn("scope", "text", (c) => c.notNull())
        .addColumn("success", "integer", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .execute();
      await db.schema
        .createIndex("login_attempts_ip_idx")
        .on("login_attempts")
        .columns(["scope", "ip", "created_at"])
        .execute();

      await db.schema
        .createTable("ip_blocks")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("ip", "text")
        .addColumn("identifier", "text")
        .addColumn("scope", "text", (c) => c.notNull())
        .addColumn("until", "text", (c) => c.notNull())
        .addColumn("reason", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("ip_rules")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("cidr", "text", (c) => c.notNull())
        .addColumn("type", "text", (c) => c.notNull())
        .addColumn("note", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .execute();
    },
    async down(db: Kysely<any>) {
      for (const t of [
        "ip_rules",
        "ip_blocks",
        "login_attempts",
        "day_events",
        "visits",
        "days",
        "calendars",
        "media",
        "settings",
        "password_resets",
        "sessions",
        "users",
      ]) {
        await db.schema.dropTable(t).ifExists().execute();
      }
    },
  },
};

const provider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};

export async function migrateToLatest(db: Kysely<any>) {
  const migrator = new Migrator({ db, provider });
  const { error, results } = await migrator.migrateToLatest();
  for (const r of results ?? []) {
    if (r.status === "Error") console.error(`[db] migration ${r.migrationName} failed`);
    else if (r.status === "Success") console.log(`[db] migration ${r.migrationName} applied`);
  }
  if (error) throw error;
}
