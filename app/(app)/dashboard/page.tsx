import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { BarChart3, Eye, Lock, MousePointerClick, QrCode, Search } from "lucide-react";
import { Badge, Card, EmptyState, Input, LinkButton, PageHeader, Select, buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { listCalendars } from "@/lib/calendar/repo";
import { normalizeTheme } from "@/lib/calendar/theme";
import { getDb } from "@/lib/db";
import { safeJson } from "@/lib/utils";
import { CalendarCardMenu } from "./card-menu";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; owner?: string; sort?: string }>;
}) {
  const user = await requireUser();
  const filters = await searchParams;
  const t = await getTranslations("dashboard");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const calendars = await listCalendars(user, filters);
  const owners =
    user.role === "admin" ? await (await getDb()).selectFrom("users").select(["id", "name"]).orderBy("name").execute() : [];
  const hasFilters = !!(filters.q || filters.status || filters.owner);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={<LinkButton href="/dashboard/new">+ {tn("newCalendar")}</LinkButton>}
      />

      <form className="mb-6 flex flex-wrap gap-2" method="get">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input name="q" defaultValue={filters.q} placeholder={tc("search")} className="pl-9" />
        </div>
        <Select name="status" defaultValue={filters.status ?? ""} className="w-auto">
          <option value="">{t("filterAll")}</option>
          <option value="published">{t("filterPublished")}</option>
          <option value="draft">{t("filterDraft")}</option>
        </Select>
        {user.role === "admin" && (
          <Select name="owner" defaultValue={filters.owner ?? ""} className="w-auto">
            <option value="">{t("allOwners")}</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        )}
        <Select name="sort" defaultValue={filters.sort ?? ""} className="w-auto">
          <option value="">{t("sortRecent")}</option>
          <option value="title">{t("sortTitle")}</option>
          <option value="start">{t("sortStart")}</option>
        </Select>
        <button type="submit" className={buttonClass("outline")}>
          <Search className="h-4 w-4" />
        </button>
      </form>

      {calendars.length === 0 ? (
        hasFilters ? (
          <EmptyState icon="🔍" title={tc("none")} />
        ) : (
          <EmptyState
            icon="🎁"
            title={t("emptyTitle")}
            description={t("emptyDesc")}
            action={<LinkButton href="/dashboard/new" size="lg">+ {tn("newCalendar")}</LinkButton>}
          />
        )
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {calendars.map((c) => {
            const theme = normalizeTheme(safeJson(c.theme, {}));
            return (
              <Card key={c.id} className="group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift">
                <Link href={`/dashboard/c/${c.id}/days`} className="block">
                  <div
                    className="relative h-32 overflow-hidden"
                    style={{
                      background: theme.backgroundImage ? `center/cover url("${theme.backgroundImage}")` : theme.background,
                    }}
                  >
                    <div className="absolute inset-0 grid grid-cols-6 gap-1.5 p-3 opacity-90">
                      {Array.from({ length: 12 }, (_, i) => (
                        <div
                          key={i}
                          className="grid place-items-center rounded-md text-[10px] font-bold shadow-sm"
                          style={{ background: theme.door, color: theme.doorText }}
                        >
                          {((i * 7) % 24) + 1}
                        </div>
                      ))}
                    </div>
                    <div className="absolute left-3 top-3 flex gap-1.5">
                      {c.published ? <Badge tone="success">{t("published")}</Badge> : <Badge>{t("draft")}</Badge>}
                      {c.password_hash && (
                        <Badge tone="warning">
                          <Lock className="h-3 w-3" /> {t("protected")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/dashboard/c/${c.id}/days`} className="block truncate font-semibold hover:text-brand-700">
                        {c.title}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">
                        {format.dateTime(new Date(`${c.start_date}T12:00:00`), { day: "numeric", month: "short" })} →{" "}
                        {format.dateTime(new Date(`${c.end_date}T12:00:00`), { day: "numeric", month: "short", year: "numeric" })}
                        {user.role === "admin" && c.owner_id !== user.id && <> · {c.owner_name}</>}
                      </div>
                    </div>
                    <CalendarCardMenu id={c.id} slug={c.slug} />
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-gold-400"
                      style={{ width: `${c.day_count ? (c.filled_count / c.day_count) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span>{t("days", { count: `${c.filled_count}/${c.day_count}` })}</span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" /> {t("visits", { count: c.visit_count })}
                    </span>
                    <span className="flex items-center gap-1">
                      <MousePointerClick className="h-3.5 w-3.5" /> {t("opens", { count: c.open_count })}
                    </span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <LinkButton href={`/dashboard/c/${c.id}/days`} variant="outline" size="sm" className="flex-1">
                      {tc("edit")}
                    </LinkButton>
                    <LinkButton href={`/dashboard/c/${c.id}/stats`} variant="ghost" size="icon" aria-label="Stats">
                      <BarChart3 className="h-4 w-4" />
                    </LinkButton>
                    <LinkButton href={`/dashboard/c/${c.id}/qr`} variant="ghost" size="icon" aria-label="QR">
                      <QrCode className="h-4 w-4" />
                    </LinkButton>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
