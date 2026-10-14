"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { KeyRound, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Input, Select, Toggle, buttonClass } from "@/components/ui";
import { Modal } from "@/components/calendar/modal";
import { createUserAction, deleteUserAction, sendResetLinkAction, updateUserAction, type AdminState } from "../actions";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "admin" | "creator";
  active: boolean;
  last_login_at: string | null;
  calendars: number;
}

function LinkBox({ link }: { link: string }) {
  const tc = useTranslations("common");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}
      >
        {copied ? tc("copied") : tc("copy")}
      </Button>
    </div>
  );
}

function StateMessages({ state }: { state: AdminState }) {
  const t = useTranslations("admin");
  if (!state) return null;
  return (
    <div className="space-y-2">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      {state.link && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted">{t("resetLinkCopy")}</p>
          <LinkBox link={state.link} />
        </div>
      )}
    </div>
  );
}

function UserForm({ user, onDone }: { user?: UserRow; onDone: () => void }) {
  const t = useTranslations("admin");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const action = user ? updateUserAction.bind(null, user.id) : createUserAction;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [invite, setInvite] = useState(!user);

  useEffect(() => {
    if (state?.success && !state.link && !state.error) {
      const id = setTimeout(onDone, 700);
      return () => clearTimeout(id);
    }
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <h3 className="text-lg font-bold">{user ? user.name : t("newUser")}</h3>
      <Field label={ta("name")}>
        <Input name="name" defaultValue={user?.name} required maxLength={100} />
      </Field>
      <Field label={ta("email")}>
        <Input name="email" type="email" defaultValue={user?.email} required />
      </Field>
      <Field label={t("role")}>
        <Select name="role" defaultValue={user?.role ?? "creator"}>
          <option value="creator">{t("roles.creator")}</option>
          <option value="admin">{t("roles.admin")}</option>
        </Select>
      </Field>
      {!user && <Toggle name="invite" label={t("sendInvite")} checked={invite} onChange={(e) => setInvite(e.target.checked)} />}
      {(user || !invite) && (
        <Field label={user ? t("setPassword") : ta("password")} hint={user ? t("passwordOptional") : ta("passwordTooShort")}>
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required={!user && !invite} />
        </Field>
      )}
      {user && <Toggle name="active" label={t("active")} defaultChecked={user.active} />}
      <StateMessages state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {tc("close")}
        </Button>
        <Button type="submit" disabled={pending}>
          {user ? tc("save") : tc("create")}
        </Button>
      </div>
    </form>
  );
}

export function UsersManager({ users, meId, query }: { users: UserRow[]; meId: string; query: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [rowState, setRowState] = useState<{ id: string; state: AdminState } | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <form method="get" className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input name="q" defaultValue={query} placeholder={tc("search")} className="pl-9" />
        </form>
        <Button onClick={() => setEditing("new")}>
          <UserPlus className="h-4 w-4" /> {t("newUser")}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{t("user")}</th>
                <th className="px-4 py-3">{t("role")}</th>
                <th className="px-4 py-3 text-right">{t("calendars")}</th>
                <th className="px-4 py-3">{t("lastLogin")}</th>
                <th className="px-4 py-3 text-right">{tc("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id} className="align-top hover:bg-stone-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-pine-600 text-sm font-bold uppercase text-white">
                        {u.name.slice(0, 1)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {u.name} {u.id === meId && <span className="text-xs font-normal text-muted">({t("you")})</span>}
                        </div>
                        <div className="truncate text-xs text-muted">{u.email}</div>
                      </div>
                    </div>
                    {rowState?.id === u.id && (
                      <div className="mt-2">
                        <StateMessages state={rowState.state} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={u.role === "admin" ? "info" : "neutral"}>{t(`roles.${u.role}`)}</Badge>
                      {!u.active && <Badge tone="danger">{t("inactive")}</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.calendars}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {u.last_login_at ? format.relativeTime(new Date(u.last_login_at)) : tc("never")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" className={buttonClass("ghost", "icon")} title={tc("edit")} onClick={() => setEditing(u)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={buttonClass("ghost", "icon")}
                        title={t("resetLink")}
                        disabled={pending}
                        onClick={() => start(async () => setRowState({ id: u.id, state: await sendResetLinkAction(u.id) }))}
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      {u.id !== meId && (
                        <button
                          type="button"
                          className={buttonClass("ghost", "icon", "text-brand-700 hover:bg-brand-50")}
                          title={tc("delete")}
                          disabled={pending}
                          onClick={() => {
                            if (confirm(t("deleteUserConfirm"))) start(async () => void (await deleteUserAction(u.id)));
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)}>
        {editing && <UserForm key={editing === "new" ? "new" : editing.id} user={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
