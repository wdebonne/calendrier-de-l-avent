import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Eye, Lock } from "lucide-react";
import { Badge, LinkButton } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { getManagedCalendar } from "@/lib/calendar/repo";
import { CalendarTabs } from "./tabs";
import { CopyLink } from "./copy-link";

export default async function CalendarLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const cal = await getManagedCalendar(id, user);
  const t = await getTranslations("calendar");
  const td = await getTranslations("dashboard");
  const tn = await getTranslations("nav");

  return (
    <>
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {tn("dashboard")}
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{cal.title}</h1>
            {cal.published ? <Badge tone="success">{td("published")}</Badge> : <Badge>{td("draft")}</Badge>}
            {cal.password_hash && (
              <Badge tone="warning">
                <Lock className="h-3 w-3" /> {td("protected")}
              </Badge>
            )}
          </div>
          <CopyLink slug={cal.slug} />
        </div>
        <LinkButton href={`/c/${cal.slug}?preview=1`} target="_blank" variant="secondary" title={t("previewHint")}>
          <Eye className="h-4 w-4" /> {t("openPreview")}
        </LinkButton>
      </div>
      <CalendarTabs id={id} />
      <div className="mt-6">{children}</div>
    </>
  );
}
