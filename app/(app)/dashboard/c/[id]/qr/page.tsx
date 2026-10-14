import { requireUser } from "@/lib/auth/session";
import { getManagedCalendar } from "@/lib/calendar/repo";
import { safeJson } from "@/lib/utils";
import { QrEditor, type QrConfig } from "./qr-editor";

export default async function QrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const cal = await getManagedCalendar(id, user);
  return (
    <QrEditor
      calendarId={id}
      slug={cal.slug}
      title={cal.title}
      baseUrl={process.env.APP_URL?.replace(/\/+$/, "") ?? null}
      initial={safeJson<Partial<QrConfig>>(cal.qr_config, {})}
    />
  );
}
