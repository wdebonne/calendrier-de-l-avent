import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { defaultAdventRange } from "@/lib/calendar/dates";
import { generateUniqueSlug } from "@/lib/calendar/repo";
import { TIMEZONES } from "@/lib/calendar/theme";
import { createCalendarAction } from "../actions";
import { CalendarSettingsForm } from "../settings-form";

export default async function NewCalendarPage() {
  await requireUser();
  const t = await getTranslations("calendar");
  const range = defaultAdventRange();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("newTitle")} description={t("newSubtitle")} />
      <CalendarSettingsForm
        mode="create"
        timezones={TIMEZONES}
        action={createCalendarAction}
        values={{
          title: "",
          description: "",
          slug: await generateUniqueSlug(),
          start_date: range.start,
          end_date: range.end,
          timezone: "Europe/Paris",
          unlock_mode: "date",
          published: false,
          hasPassword: false,
        }}
      />
    </div>
  );
}
