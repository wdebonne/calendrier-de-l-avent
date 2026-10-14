"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Alert, Button, Card, Field, Input, Select, Textarea, Toggle } from "@/components/ui";
import { cn } from "@/lib/utils";
import { newSlugAction, type ActionState } from "./actions";
import { useFormAction } from "@/components/use-form-action";

export interface SettingsValues {
  title: string;
  description: string;
  slug: string;
  start_date: string;
  end_date: string;
  timezone: string;
  unlock_mode: "date" | "all";
  published: boolean;
  hasPassword: boolean;
}

export function CalendarSettingsForm({
  mode,
  values,
  timezones,
  action,
}: {
  mode: "create" | "edit";
  values: SettingsValues;
  timezones: string[];
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const t = useTranslations("calendar");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useFormAction(action, undefined);
  const [slug, setSlug] = useState(values.slug);
  const [unlock, setUnlock] = useState(values.unlock_mode);
  const [removePwd, setRemovePwd] = useState(false);
  const [slugPending, startSlug] = useTransition();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const err = (field: string) => (state?.field === field ? state.error : undefined);

  return (
    <form onSubmit={formAction} className="space-y-6">
      <Card className="space-y-5 p-5 sm:p-6">
        <Field label={t("title")} htmlFor="title" error={err("title")}>
          <Input id="title" name="title" defaultValue={values.title} placeholder={t("titlePlaceholder")} required maxLength={120} />
        </Field>
        <Field label={t("description")} htmlFor="description">
          <Textarea
            id="description"
            name="description"
            defaultValue={values.description}
            placeholder={t("descriptionPlaceholder")}
            maxLength={1000}
            rows={2}
          />
        </Field>
        <Field label={t("slug")} htmlFor="slug" hint={t("slugHint")} error={err("slug")}>
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-line bg-stone-50 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
              <span className="hidden shrink-0 pl-3.5 text-sm text-muted sm:inline">{origin}/c/</span>
              <input
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="h-10 min-w-0 flex-1 bg-white px-2 text-sm font-mono outline-none sm:rounded-l-none"
                required
                maxLength={60}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              title={t("regenerate")}
              disabled={slugPending}
              onClick={() => startSlug(async () => setSlug(await newSlugAction()))}
            >
              <RefreshCw className={cn("h-4 w-4", slugPending && "animate-spin")} />
            </Button>
          </div>
        </Field>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("startDate")} htmlFor="start_date" error={err("start_date")}>
            <Input id="start_date" name="start_date" type="date" defaultValue={values.start_date} required />
          </Field>
          <Field label={t("endDate")} htmlFor="end_date">
            <Input id="end_date" name="end_date" type="date" defaultValue={values.end_date} required />
          </Field>
          <Field label={t("timezone")} htmlFor="timezone">
            <Select id="timezone" name="timezone" defaultValue={values.timezone}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="-mt-2 text-xs text-muted">{t("rangeHint")}</p>

        {mode === "edit" && (
          <>
            <div>
              <div className="mb-2 text-sm font-medium text-stone-700">{t("unlockMode")}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["date", "all"] as const).map((m) => (
                  <label
                    key={m}
                    className={cn(
                      "cursor-pointer rounded-xl border p-4 transition",
                      unlock === m ? "border-brand-400 bg-brand-50 ring-4 ring-brand-100" : "border-line hover:border-stone-300",
                    )}
                  >
                    <input
                      type="radio"
                      name="unlock_mode"
                      value={m}
                      checked={unlock === m}
                      onChange={() => setUnlock(m)}
                      className="sr-only"
                    />
                    <div className="text-sm font-semibold">{m === "date" ? `📅 ${t("unlockDate")}` : `🔓 ${t("unlockAll")}`}</div>
                    <div className="mt-1 text-xs text-muted">{m === "date" ? t("unlockDateDesc") : t("unlockAllDesc")}</div>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      {mode === "edit" && (
        <Card className="space-y-5 p-5 sm:p-6">
          <Field label={`🔒 ${t("password")}`} htmlFor="password" hint={values.hasPassword ? t("passwordSet") : t("passwordHint")}>
            <Input id="password" name="password" type="password" autoComplete="new-password" disabled={removePwd} placeholder={values.hasPassword ? "••••••••" : ""} />
          </Field>
          {values.hasPassword && (
            <Toggle name="remove_password" label={t("removePassword")} checked={removePwd} onChange={(e) => setRemovePwd(e.target.checked)} />
          )}
          <Toggle name="published" label={t("published")} description={t("publishedDesc")} defaultChecked={values.published} />
        </Card>
      )}

      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? tc("saving") : mode === "create" ? tc("create") : tc("save")}
        </Button>
      </div>
    </form>
  );
}
