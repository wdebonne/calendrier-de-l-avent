import { requireUser } from "@/lib/auth/session";
import { getManagedCalendar } from "@/lib/calendar/repo";
import { TIMEZONES } from "@/lib/calendar/theme";
import { updateSettingsAction } from "../../../actions";
import { CalendarSettingsForm } from "../../../settings-form";
import { DangerZone } from "./danger-zone";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const cal = await getManagedCalendar(id, user);
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <CalendarSettingsForm
        mode="edit"
        timezones={TIMEZONES}
        action={updateSettingsAction.bind(null, id)}
        values={{
          title: cal.title,
          description: cal.description ?? "",
          slug: cal.slug,
          start_date: cal.start_date,
          end_date: cal.end_date,
          timezone: cal.timezone,
          unlock_mode: cal.unlock_mode,
          published: !!cal.published,
          hasPassword: !!cal.password_hash,
        }}
      />
      <DangerZone id={id} />
    </div>
  );
}
