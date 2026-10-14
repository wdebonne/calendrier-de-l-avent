import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Input, Select, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/** GET form: period presets, custom range, optional calendar picker and CSV export link. */
export async function StatsFilters({
  period,
  from,
  to,
  exportHref,
  calendars,
  calendarId,
}: {
  period?: string;
  from?: string;
  to?: string;
  exportHref: string;
  calendars?: { id: string; title: string }[];
  calendarId?: string;
}) {
  const t = await getTranslations("stats");
  const presets = [
    { value: "", label: t("allTime") },
    { value: "7", label: t("last7") },
    { value: "30", label: t("last30") },
  ];
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      {calendars && (
        <Select name="calendar" defaultValue={calendarId ?? ""} className="w-auto max-w-64">
          <option value="">{t("allCalendars")}</option>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
      )}
      <div className="inline-flex rounded-xl border border-line bg-white p-0.5">
        {presets.map((p) => (
          <button
            key={p.value}
            type="submit"
            name="period"
            value={p.value}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              (period ?? "") === p.value ? "bg-ink text-white" : "text-stone-600 hover:bg-stone-100",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-sm text-muted">
        {t("from")}
        <Input type="date" name="from" defaultValue={period === "custom" ? from : ""} className="w-auto" />
      </label>
      <label className="flex items-center gap-1.5 text-sm text-muted">
        {t("to")}
        <Input type="date" name="to" defaultValue={period === "custom" ? to : ""} className="w-auto" />
      </label>
      <button type="submit" name="period" value="custom" className={buttonClass("outline")}>
        {t("apply")}
      </button>
      <a href={exportHref} className={cn(buttonClass("ghost"), "ml-auto")}>
        <Download className="h-4 w-4" /> {t("exportCsv")}
      </a>
    </form>
  );
}
