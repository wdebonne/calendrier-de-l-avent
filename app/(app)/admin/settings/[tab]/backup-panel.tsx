"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Archive, Download, Loader2, Lock, RotateCcw, Trash2, Upload } from "lucide-react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, buttonClass } from "@/components/ui";
import { Modal } from "@/components/calendar/modal";
import type { BackupErrorCode } from "@/lib/backup/container";
import type { JobState } from "@/lib/backup/job";
import type { BackupInfo } from "@/lib/backup/service";

type ClientError = BackupErrorCode | "passwordTooShort" | "passwordMismatch" | "interrupted" | "network" | "tooLarge";

const HEADERS = { "Content-Type": "application/json", "x-advent-request": "1" };

function size(bytes: number, locale: string) {
  const units = locale === "fr" ? ["o", "Ko", "Mo", "Go"] : ["B", "KB", "MB", "GB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toLocaleString(locale, { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
}

export function BackupPanel({ backups, locale }: { backups: BackupInfo[]; locale: string }) {
  const t = useTranslations("admin.backup");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [job, setJob] = useState<{ token: string; type: JobState["type"]; state: JobState | null } | null>(null);
  const [error, setError] = useState<ClientError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [restored, setRestored] = useState<JobState | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [restoring, setRestoring] = useState<BackupInfo | null>(null);
  const [upload, setUpload] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = !!job || upload !== null;

  // Poll the running job.
  useEffect(() => {
    if (!job) return;
    let stop = false;
    let failures = 0;
    const finish = (after: () => void) => {
      setJob(null);
      after();
    };
    const poll = async () => {
      if (stop) return;
      try {
        const res = await fetch(`/api/backup?job=${encodeURIComponent(job.token)}`, { cache: "no-store" });
        if (stop) return;
        // The server restarted: the job is gone.
        if (res.status === 404) return finish(() => setError("interrupted"));
        const state = (await res.json()) as JobState;
        failures = 0;
        if (state.status === "error") return finish(() => setError(state.error ?? "failed"));
        if (state.status === "done") {
          return finish(() => {
            if (state.type === "restore") setRestored(state);
            else {
              setSuccess(t("created"));
              router.refresh();
            }
          });
        }
        setJob((j) => (j ? { ...j, state } : j));
      } catch {
        if (++failures > 20) return finish(() => setError("interrupted"));
      }
      setTimeout(poll, 1000);
    };
    const timer = setTimeout(poll, 400);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // Only a new job restarts the polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.token]);

  function reset() {
    setError(null);
    setSuccess(null);
  }

  async function start(type: JobState["type"], body: Record<string, unknown>) {
    reset();
    try {
      const res = await fetch("/api/backup", { method: "POST", headers: HEADERS, body: JSON.stringify({ action: type, ...body }) });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "failed");
      else setJob({ token: json.job, type, state: null });
    } catch {
      setError("network");
    }
  }

  function create(e: React.FormEvent) {
    e.preventDefault();
    if (password && password.length < 8) return setError("passwordTooShort");
    if (password !== confirmPassword) return setError("passwordMismatch");
    start("create", { password });
    setPassword("");
    setConfirmPassword("");
  }

  async function remove(b: BackupInfo) {
    if (!confirm(t("deleteConfirm"))) return;
    reset();
    try {
      const res = await fetch(`/api/backup/${b.name}`, { method: "DELETE", headers: HEADERS });
      if (!res.ok) setError((await res.json()).error ?? "failed");
    } catch {
      setError("network");
    }
    router.refresh();
  }

  function importFile(file: File) {
    reset();
    setUpload(0);
    // XMLHttpRequest, because fetch does not report the upload progress.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/backup/import");
    xhr.setRequestHeader("x-advent-request", "1");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && setUpload(e.loaded / e.total);
    xhr.onload = () => {
      setUpload(null);
      if (xhr.status === 200) {
        setSuccess(t("imported"));
        router.refresh();
        return;
      }
      let code: ClientError = xhr.status === 413 ? "tooLarge" : "failed";
      try {
        code = JSON.parse(xhr.responseText).error ?? code;
      } catch {
        /* error page of a proxy */
      }
      setError(code);
    };
    xhr.onerror = () => {
      setUpload(null);
      setError("network");
    };
    xhr.send(file);
  }

  const errorText = error && (t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.failed"));
  const progress = upload !== null ? upload : job?.state?.total ? job.state.done / job.state.total : null;

  return (
    <div className="space-y-6">
      {errorText && <Alert tone="error">{errorText}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {busy && (
        <Card className="p-5" aria-live="polite">
          <div className="flex items-center gap-3 text-sm font-medium">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
            {upload !== null ? t("uploading") : t(`phases.${job?.state?.phase ?? "start"}`)}
            {progress !== null && <span className="ml-auto tabular-nums text-muted">{Math.round(progress * 100)} %</span>}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className={progress === null ? "h-full w-1/3 animate-pulse rounded-full bg-brand-500" : "h-full rounded-full bg-brand-500 transition-all"}
              style={progress === null ? undefined : { width: `${progress * 100}%` }}
            />
          </div>
          {job?.type === "restore" && <p className="mt-3 text-xs text-muted">{t("doNotClose")}</p>}
        </Card>
      )}

      <Card>
        <CardHeader title={`💾 ${t("createTitle")}`} description={t("createDesc")} />
        <form onSubmit={create} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`${t("password")} (${tc("optional")})`} htmlFor="backup-password">
              <Input id="backup-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {password && (
              <Field label={t("passwordConfirm")} htmlFor="backup-password2">
                <Input id="backup-password2" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </Field>
            )}
          </div>
          <p className="text-xs text-muted">{password ? t("passwordWarning") : t("passwordHint")}</p>
          <Button type="submit" disabled={busy}>
            <Archive className="h-4 w-4" /> {t("create")}
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title={t("listTitle")}
          description={t("listDesc")}
          action={
            <>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> {t("import")}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".gz,.avent,application/gzip"
                className="hidden"
                aria-label={t("import")}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importFile(f);
                  e.target.value = "";
                }}
              />
            </>
          }
        />
        {backups.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {backups.map((b) => (
              <li key={b.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {format.dateTime(new Date(b.manifest?.createdAt ?? b.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                    {b.kind !== "manual" && <Badge tone={b.kind === "safety" ? "warning" : "info"}>{t(`kinds.${b.kind}`)}</Badge>}
                    {b.encrypted && (
                      <Badge>
                        <Lock className="h-3 w-3" /> {t("encrypted")}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {size(b.size, locale)}
                    {b.manifest &&
                      ` · ${t("summary", {
                        calendars: b.manifest.tables.calendars ?? 0,
                        users: b.manifest.tables.users ?? 0,
                        media: b.manifest.media.files,
                      })}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <a href={`/api/backup/${b.name}`} download className={buttonClass("ghost", "icon")} title={t("download")} aria-label={t("download")}>
                    <Download className="h-4 w-4" />
                  </a>
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setRestoring(b)}>
                    <RotateCcw className="h-4 w-4" /> {t("restore")}
                  </Button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(b)}
                    className={buttonClass("ghost", "icon", "text-brand-700 hover:bg-brand-50")}
                    title={tc("delete")}
                    aria-label={tc("delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={!!restoring} onClose={() => setRestoring(null)} label={t("restoreTitle")}>
        {restoring && (
          <RestoreForm
            backup={restoring}
            onCancel={() => setRestoring(null)}
            onConfirm={(pw) => {
              const name = restoring.name;
              setRestoring(null);
              start("restore", { name, password: pw });
            }}
          />
        )}
      </Modal>

      <Modal open={!!restored} onClose={() => window.location.assign("/login")} label={t("restoredTitle")}>
        {restored?.result && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-5xl">✅</div>
              <h3 className="mt-2 text-xl font-bold">{t("restoredTitle")}</h3>
              <p className="mt-1 text-sm text-stone-600">
                {t("summary", {
                  calendars: restored.result.tables.calendars ?? 0,
                  users: restored.result.tables.users ?? 0,
                  media: restored.result.mediaFiles,
                })}
              </p>
            </div>
            {restored.result.smtpPasswordLost && <Alert tone="warning">{t("smtpLost")}</Alert>}
            {restored.result.missingMedia > 0 && <Alert tone="warning">{t("missingMedia", { count: restored.result.missingMedia })}</Alert>}
            {restored.result.ipRulesRemoved > 0 && <Alert tone="warning">{t("ipRulesRemoved", { count: restored.result.ipRulesRemoved })}</Alert>}
            <p className="text-sm text-stone-600">{t("restoredLogin")}</p>
            <Button className="w-full" onClick={() => window.location.assign("/login")}>
              {t("goLogin")}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function RestoreForm({ backup, onCancel, onConfirm }: { backup: BackupInfo; onCancel: () => void; onConfirm: (password: string) => void }) {
  const t = useTranslations("admin.backup");
  const tc = useTranslations("common");
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(password);
      }}
    >
      <h3 className="pr-10 text-lg font-bold">{t("restoreTitle")}</h3>
      <Alert tone="warning">{t("restoreWarning")}</Alert>
      <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
        <li>{t("restorePoint1")}</li>
        <li>{t("restorePoint2")}</li>
        <li>{t("restorePoint3")}</li>
      </ul>
      {backup.encrypted && (
        <Field label={t("password")} htmlFor="restore-password">
          <Input id="restore-password" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </Field>
      )}
      <label className="flex cursor-pointer items-start gap-3 text-sm font-medium">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
        {t("understood")}
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {tc("cancel")}
        </Button>
        <Button type="submit" disabled={!understood || (backup.encrypted && !password)}>
          <RotateCcw className="h-4 w-4" /> {t("restoreNow")}
        </Button>
      </div>
    </form>
  );
}
