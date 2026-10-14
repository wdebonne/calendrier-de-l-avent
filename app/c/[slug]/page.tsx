import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CalendarView } from "@/components/calendar/calendar-view";
import { getCurrentUser } from "@/lib/auth/session";
import { getCalendarDays } from "@/lib/calendar/repo";
import {
  buildPublicDays,
  canManage,
  checkCalendarAccess,
  getVisitorId,
  loadCalendarBySlug,
} from "@/lib/calendar/public";
import { normalizeTheme } from "@/lib/calendar/theme";
import { safeJson } from "@/lib/utils";
import { PasswordGate } from "./password-gate";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string; src?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const cal = await loadCalendarBySlug(slug);
  return {
    title: cal?.published ? cal.title : "🎄",
    robots: { index: false, follow: false },
  };
}

function Message({ icon, title, text }: { icon: string; title: string; text?: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-brand-800 via-brand-700 to-pine-900 p-6 text-center text-white">
      <div className="text-6xl">{icon}</div>
      <h1 className="mt-4 font-festive text-4xl font-bold">{title}</h1>
      {text && <p className="mt-2 max-w-md opacity-80">{text}</p>}
    </main>
  );
}

export default async function PublicCalendarPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { preview: previewParam, src } = await searchParams;
  const t = await getTranslations("public");
  const cal = await loadCalendarBySlug(slug);
  if (!cal) return <Message icon="🔍" title={t("notFoundTitle")} text={t("notFoundDesc")} />;

  const user = await getCurrentUser();
  const manager = canManage(user, cal);
  const preview = manager && previewParam === "1";
  const access = await checkCalendarAccess(cal, { manager, preview });
  const theme = normalizeTheme(safeJson(cal.theme, {}));

  if (access === "unpublished") return <Message icon="🎁" title={t("notFoundTitle")} text={t("notPublished")} />;
  if (access === "password") return <PasswordGate slug={slug} title={cal.title} theme={theme} />;

  // Reading the visitor cookie only; it is created by the first API call.
  const visitorId = await getVisitorId(false);
  const days = await buildPublicDays(cal, await getCalendarDays(cal.id), { manager, preview }, visitorId);

  return (
    <CalendarView
      slug={slug}
      title={cal.title}
      description={cal.description}
      theme={theme}
      doorAnimation={cal.door_animation}
      openAnimation={cal.open_animation}
      days={days}
      preview={preview}
      source={src}
    />
  );
}
