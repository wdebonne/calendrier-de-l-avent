import { sql } from "kysely";
import { currentDbConfig, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await sql`select 1`.execute(db);
    return Response.json({ status: "ok", db: currentDbConfig().engine });
  } catch (e) {
    return Response.json({ status: "error", error: (e as Error).message }, { status: 503 });
  }
}
