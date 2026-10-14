import { requireUser } from "@/lib/auth/session";
import { getManagedCalendar } from "@/lib/calendar/repo";
import { normalizeTheme } from "@/lib/calendar/theme";
import { safeJson } from "@/lib/utils";
import { AppearanceEditor } from "./appearance-editor";

export default async function AppearancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const cal = await getManagedCalendar(id, user);
  return (
    <AppearanceEditor
      calendarId={id}
      slug={cal.slug}
      title={cal.title}
      description={cal.description}
      startDate={cal.start_date}
      endDate={cal.end_date}
      initialTheme={normalizeTheme(safeJson(cal.theme, {}))}
      initialDoor={cal.door_animation}
      initialOpen={cal.open_animation}
    />
  );
}
