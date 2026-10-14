import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { UsersManager } from "./users-manager";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireAdmin();
  const { q } = await searchParams;
  const t = await getTranslations("admin");
  const db = await getDb();
  let query = db.selectFrom("users").select(["id", "name", "email", "role", "active", "last_login_at", "created_at"]).orderBy("created_at");
  if (q) {
    const term = `%${q.toLowerCase()}%`;
    query = query.where((eb) => eb.or([eb(eb.fn("lower", ["name"]), "like", term), eb("email", "like", term)]));
  }
  const users = await query.execute();
  const counts = await db
    .selectFrom("calendars")
    .select(["owner_id", (eb) => eb.fn.countAll<number>().as("n")])
    .groupBy("owner_id")
    .execute();
  const countMap = Object.fromEntries(counts.map((c) => [c.owner_id, Number(c.n)]));
  return (
    <>
      <PageHeader title={t("usersTitle")} description={t("usersSubtitle")} />
      <UsersManager
        meId={me.id}
        query={q ?? ""}
        users={users.map((u) => ({ ...u, active: !!u.active, calendars: countMap[u.id] ?? 0 }))}
      />
    </>
  );
}
