"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Database, Loader2, Plug, RotateCcw, Send, ShieldBan, ShieldCheck, Trash2, Unlock } from "lucide-react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Textarea, Toggle } from "@/components/ui";
import type { AuthSettings, GeneralSettings, SecuritySettings, SmtpSettings } from "@/lib/settings";
import type { IpRule } from "@/lib/db/types";
import {
  addIpRuleAction,
  clearAttemptsAction,
  deleteIpRuleAction,
  migratePostgresAction,
  restartAction,
  revertToSqliteAction,
  saveAuthAction,
  saveGeneralAction,
  saveSecurityAction,
  saveSmtpAction,
  testPostgresAction,
  testSmtpAction,
  unblockAction,
  type AdminState,
} from "../../actions";
import { useFormAction } from "@/components/use-form-action";

function Messages({ state }: { state: AdminState }) {
  if (!state) return null;
  return (
    <>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
    </>
  );
}

function SaveBar({ pending }: { pending: boolean }) {
  const tc = useTranslations("common");
  return (
    <div className="flex justify-end">
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} {tc("save")}
      </Button>
    </div>
  );
}

export function GeneralForm({ general, sessionDays }: { general: GeneralSettings; sessionDays: number }) {
  const t = useTranslations("admin.general");
  const [state, action, pending] = useFormAction(saveGeneralAction, undefined);
  return (
    <form onSubmit={action} className="space-y-4">
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label={t("appName")} className="sm:col-span-2">
          <Input name="appName" defaultValue={general.appName} maxLength={80} />
        </Field>
        <Field label={t("defaultLocale")}>
          <Select name="defaultLocale" defaultValue={general.defaultLocale}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <Field label={t("maxUploadMb")}>
          <Input name="maxUploadMb" type="number" min={1} max={500} defaultValue={general.maxUploadMb} />
        </Field>
        <Field label={t("slugLength")}>
          <Input name="slugLength" type="number" min={6} max={20} defaultValue={general.slugLength} />
        </Field>
        <Field label={t("sessionDays")}>
          <Input name="sessionDays" type="number" min={1} max={365} defaultValue={sessionDays} />
        </Field>
      </Card>
      <Messages state={state} />
      <SaveBar pending={pending} />
    </form>
  );
}

export function SmtpForm({ smtp }: { smtp: SmtpSettings & { hasPassword: boolean } }) {
  const t = useTranslations("admin.smtp");
  const [state, action, pending] = useFormAction(saveSmtpAction, undefined);
  const [testState, setTestState] = useState<AdminState>(undefined);
  const [testing, startTest] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [testTo, setTestTo] = useState("");

  return (
    <form ref={formRef} onSubmit={action} className="space-y-4">
      <Card className="space-y-4 p-5">
        <Toggle name="enabled" label={t("enabled")} defaultChecked={smtp.enabled} />
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label={t("host")}>
            <Input name="host" defaultValue={smtp.host} placeholder="smtp.example.com" />
          </Field>
          <Field label={t("port")}>
            <Input name="port" type="number" defaultValue={smtp.port} />
          </Field>
        </div>
        <Toggle name="secure" label={t("secure")} description={t("secureHint")} defaultChecked={smtp.secure} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("user")}>
            <Input name="user" defaultValue={smtp.user} autoComplete="off" />
          </Field>
          <Field label={t("password")} hint={smtp.hasPassword ? t("passwordKeep") : undefined}>
            <Input name="password" type="password" autoComplete="new-password" placeholder={smtp.hasPassword ? "••••••••" : ""} />
          </Field>
          <Field label={t("fromEmail")}>
            <Input name="fromEmail" type="email" defaultValue={smtp.fromEmail} placeholder="noreply@example.com" />
          </Field>
          <Field label={t("fromName")}>
            <Input name="fromName" defaultValue={smtp.fromName} />
          </Field>
        </div>
      </Card>
      <Messages state={state} />
      <SaveBar pending={pending} />

      <Card>
        <CardHeader title={`✉️ ${t("testTitle")}`} />
        <div className="space-y-3 p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              name="testTo"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder={t("testTo")}
              aria-label={t("testTo")}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={testing || !testTo}
              onClick={() =>
                startTest(async () => {
                  setTestState(undefined);
                  setTestState(await testSmtpAction(new FormData(formRef.current!)));
                })
              }
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("testSend")}
            </Button>
          </div>
          <Messages state={testState} />
        </div>
      </Card>
    </form>
  );
}

export function AuthForm({ auth, smtpEnabled }: { auth: AuthSettings; smtpEnabled: boolean }) {
  const t = useTranslations("admin.auth");
  const [state, action, pending] = useFormAction(saveAuthAction, undefined);
  return (
    <form onSubmit={action} className="space-y-4">
      {!smtpEnabled && <Alert tone="warning">{t("smtpRequired")}</Alert>}
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <Toggle name="forgotPasswordEnabled" label={t("forgotEnabled")} defaultChecked={auth.forgotPasswordEnabled} className="sm:col-span-2" />
        <Field label={t("resetTokenMinutes")}>
          <Input name="resetTokenMinutes" type="number" min={5} max={10080} defaultValue={auth.resetTokenMinutes} />
        </Field>
      </Card>
      {(["fr", "en"] as const).map((lang) => (
        <Card key={lang}>
          <CardHeader
            title={lang === "fr" ? t("templateFr") : t("templateEn")}
            description={t("variables", { vars: "{{name}} {{link}} {{minutes}} {{app}} {{email}}" })}
          />
          <div className="space-y-4 p-5">
            <Field label={t("subject")}>
              <Input name={`${lang}_subject`} defaultValue={auth.templates[lang].subject} />
            </Field>
            <Field label={t("body")}>
              <Textarea name={`${lang}_body`} rows={8} defaultValue={auth.templates[lang].body} className="font-mono text-xs" />
            </Field>
          </div>
        </Card>
      ))}
      <Messages state={state} />
      <SaveBar pending={pending} />
    </form>
  );
}

interface Block {
  id: string;
  ip: string | null;
  identifier: string | null;
  scope: string;
  until: string;
  reason: string | null;
}
interface Failure {
  id: string;
  ip: string;
  identifier: string | null;
  scope: string;
  created_at: string;
}

export function SecurityPanel({
  security,
  rules,
  blocks,
  failures,
  myIp,
}: {
  security: SecuritySettings;
  rules: IpRule[];
  blocks: Block[];
  failures: Failure[];
  myIp: string;
}) {
  const t = useTranslations("admin.security");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [state, action, pending] = useFormAction(saveSecurityAction, undefined);
  const [ruleState, ruleAction, rulePending] = useActionState(addIpRuleAction, undefined);
  const [busy, start] = useTransition();
  const scopeLabel = (s: string) => (s.startsWith("unlock:") ? `🔒 ${t("calendarScope")}` : s);

  return (
    <div className="space-y-6">
      <form onSubmit={action} className="space-y-4">
        <Card>
          <CardHeader title={`🛡️ ${t("bruteforce")}`} />
          <div className="space-y-4 p-5">
            <Toggle name="enabled" label={t("enabled")} defaultChecked={security.enabled} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("maxAttempts")}>
                <Input name="maxAttempts" type="number" min={1} max={100} defaultValue={security.maxAttempts} />
              </Field>
              <Field label={t("windowMinutes")}>
                <Input name="windowMinutes" type="number" min={1} max={1440} defaultValue={security.windowMinutes} />
              </Field>
              <Field label={t("blockMinutes")}>
                <Input name="blockMinutes" type="number" min={1} max={1440} defaultValue={security.blockMinutes} />
              </Field>
            </div>
            <Toggle name="progressive" label={t("progressive")} defaultChecked={security.progressive} />
            <Toggle name="lockAccounts" label={t("lockAccounts")} defaultChecked={security.lockAccounts} />
            <Toggle name="protectCalendars" label={t("protectCalendars")} defaultChecked={security.protectCalendars} />
            <Field label={t("challengeRate")} className="max-w-xs">
              <Input name="challengeMaxAttemptsPerMinute" type="number" min={1} max={1000} defaultValue={security.challengeMaxAttemptsPerMinute} />
            </Field>
          </div>
        </Card>
        <Messages state={state} />
        <SaveBar pending={pending} />
      </form>

      <Card>
        <CardHeader title={t("rules")} description={t("rulesHint")} action={<Badge tone="info">{t("yourIp", { ip: myIp })}</Badge>} />
        <div className="space-y-4 p-5">
          <form action={ruleAction} className="grid gap-2 sm:grid-cols-[1fr_10rem_1fr_auto]">
            <Input name="cidr" placeholder={t("cidr")} required aria-label={t("cidr")} />
            <Select name="type" defaultValue="allow" aria-label="type">
              <option value="allow">{t("allow")}</option>
              <option value="deny">{t("deny")}</option>
            </Select>
            <Input name="note" placeholder={t("note")} aria-label={t("note")} />
            <Button type="submit" disabled={rulePending}>
              {t("addRule")}
            </Button>
          </form>
          <Messages state={ruleState} />
          {rules.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  {r.type === "allow" ? (
                    <Badge tone="success">
                      <ShieldCheck className="h-3 w-3" /> {t("allow")}
                    </Badge>
                  ) : (
                    <Badge tone="danger">
                      <ShieldBan className="h-3 w-3" /> {t("deny")}
                    </Badge>
                  )}
                  <code className="font-mono">{r.cidr}</code>
                  <span className="flex-1 truncate text-muted">{r.note}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => start(() => deleteIpRuleAction(r.id))}
                    className="rounded-lg p-1.5 text-stone-500 hover:bg-brand-50 hover:text-brand-700"
                    aria-label={tc("delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t("blocks")}
          action={
            blocks.length > 0 && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => start(() => unblockAction(null))}>
                <Unlock className="h-4 w-4" /> {t("unblockAll")}
              </Button>
            )
          }
        />
        <div className="p-5">
          {blocks.length === 0 ? (
            <p className="text-sm text-muted">✅ {t("noBlocks")}</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {blocks.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <code className="font-mono">{b.ip ?? b.identifier}</code>
                  <Badge>{scopeLabel(b.scope)}</Badge>
                  <span className="text-xs text-muted">
                    {t("until")} {format.dateTime(new Date(b.until), { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                  </span>
                  <span className="flex-1 text-xs text-muted">{b.reason}</span>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => start(() => unblockAction(b.id))}>
                    {t("unblock")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t("recentFailures")}
          action={
            failures.length > 0 && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => start(() => clearAttemptsAction())}>
                {t("clearAttempts")}
              </Button>
            )
          }
        />
        <div className="overflow-x-auto">
          {failures.length === 0 ? (
            <p className="p-5 text-sm text-muted">—</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {failures.map((f) => (
                  <tr key={f.id}>
                    <td className="px-5 py-2 text-xs text-muted">{format.relativeTime(new Date(f.created_at))}</td>
                    <td className="px-5 py-2 font-mono text-xs">{f.ip}</td>
                    <td className="px-5 py-2 text-xs">{f.identifier}</td>
                    <td className="px-5 py-2 text-xs">
                      <Badge>{scopeLabel(f.scope)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

export function DatabasePanel({
  engine,
  source,
  sqlitePath,
  counts,
  saved,
}: {
  engine: "sqlite" | "postgres";
  source: "env" | "file" | "default";
  sqlitePath: string;
  counts: Record<string, number>;
  saved: { host: string; port: number; database: string; user: string; ssl: boolean } | null;
}) {
  const t = useTranslations("admin.database");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<AdminState>(undefined);
  const [pending, start] = useTransition();
  const [restarting, setRestarting] = useState(false);
  const locked = source === "env";

  const run = (fn: (f: FormData) => Promise<AdminState>) =>
    start(async () => {
      setState(undefined);
      setState(await fn(new FormData(formRef.current!)));
    });

  function restart() {
    setRestarting(true);
    restartAction().catch(() => {});
    // Poll the health endpoint until the app is back, then reload.
    const started = Date.now();
    const poll = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (res.ok && Date.now() - started > 3000) return window.location.reload();
      } catch {
        /* still down */
      }
      setTimeout(poll, 1500);
    };
    setTimeout(poll, 2000);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={`🗄️ ${t("current")}`} />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted">{t("engine")}</div>
            <div className="mt-1 flex items-center gap-2 text-lg font-bold">
              <Database className="h-5 w-5 text-brand-600" /> {engine === "postgres" ? "PostgreSQL" : "SQLite"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">{t("source")}</div>
            <div className="mt-1 font-medium">{t(`sources.${source}`)}</div>
          </div>
          {engine === "sqlite" && (
            <div className="min-w-0">
              <div className="text-xs text-muted">{t("sqliteFile")}</div>
              <div className="mt-1 truncate font-mono text-xs">{sqlitePath}</div>
            </div>
          )}
          <div className="sm:col-span-3">
            <div className="mb-1 text-xs text-muted">{t("counts")}</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(counts).map(([k, v]) => (
                <Badge key={k}>
                  {k}: <strong className="tabular-nums">{v}</strong>
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {locked ? (
        <Alert tone="info">{t("envLocked")}</Alert>
      ) : (
        <Card>
          <CardHeader title={`🐘 ${t("pgTitle")}`} description={t("pgDesc")} />
          <form ref={formRef} className="space-y-4 p-5" onSubmit={(e) => e.preventDefault()}>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <Field label={t("host")}>
                <Input name="host" defaultValue={saved?.host ?? "postgres"} required />
              </Field>
              <Field label={t("port")}>
                <Input name="port" type="number" defaultValue={saved?.port ?? 5432} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("database")}>
                <Input name="database" defaultValue={saved?.database ?? "advent"} required />
              </Field>
              <Field label={t("user")}>
                <Input name="user" defaultValue={saved?.user ?? "advent"} required autoComplete="off" />
              </Field>
              <Field label={t("password")}>
                <Input name="password" type="password" autoComplete="new-password" placeholder={saved ? "••••••••" : ""} />
              </Field>
            </div>
            <Toggle name="ssl" label={t("ssl")} defaultChecked={saved?.ssl ?? false} />
            <Messages state={state} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => run(testPostgresAction)}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} {t("testConnection")}
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm(t("migrateConfirm"))) run(migratePostgresAction);
                }}
              >
                <Database className="h-4 w-4" /> {t("migrate")}
              </Button>
              {source === "file" && (
                <Button
                  type="button"
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(t("backToSqliteConfirm"))) start(async () => setState(await revertToSqliteAction()));
                  }}
                >
                  <RotateCcw className="h-4 w-4" /> {t("backToSqlite")}
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-muted">{t("restartHint")}</p>
        <Button variant="secondary" disabled={restarting} onClick={restart}>
          {restarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          {restarting ? t("restarting") : t("restart")}
        </Button>
      </Card>
    </div>
  );
}
