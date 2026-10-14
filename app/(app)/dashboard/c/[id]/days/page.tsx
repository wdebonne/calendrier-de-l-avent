import { requireUser } from "@/lib/auth/session";
import { getCalendarDays, getManagedCalendar } from "@/lib/calendar/repo";
import { safeJson } from "@/lib/utils";
import { DaysEditor, type EditableDay } from "./days-editor";

export default async function DaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const user = await requireUser();
  const cal = await getManagedCalendar(id, user);
  const days = await getCalendarDays(id);
  const editable: EditableDay[] = days.map((d) => ({
    id: d.id,
    date: d.date,
    label: d.label ?? "",
    cover_url: d.cover_url ?? "",
    content_type: d.content_type,
    content_url: d.content_url ?? "",
    content_text: d.content_text ?? "",
    open_animation: d.open_animation ?? "",
    challenge: safeJson(d.challenge, null),
  }));
  return <DaysEditor calendarId={id} days={editable} defaultAnimation={cal.open_animation} created={created === "1"} />;
}
