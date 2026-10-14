import "server-only";
import type { Kysely } from "kysely";
import { hashPassword } from "@/lib/auth/password";
import { newId, nowIso } from "@/lib/utils";
import type { Database } from "./types";

/** Creates the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD when no user exists yet. */
export async function bootstrapFromEnv(db: Kysely<Database>) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = await db.selectFrom("users").select("id").limit(1).executeTakeFirst();
  if (existing) return;
  await db
    .insertInto("users")
    .values({
      id: newId(),
      email,
      name: "Administrateur",
      password_hash: await hashPassword(password),
      role: "admin",
      active: 1,
      locale: null,
      created_at: nowIso(),
      last_login_at: null,
    })
    .execute();
  console.log(`[db] admin account created for ${email}`);
}
