"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Field, Input } from "@/components/ui";
import { forgotAction, loginAction, resetAction, setupAction, type FormState } from "./actions";

function Status({ state }: { state: FormState }) {
  if (!state) return null;
  if (state.error) return <Alert tone="error">{state.error}</Alert>;
  if (state.success) return <Alert tone="success">{state.success}</Alert>;
  return null;
}

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label={t("email")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field
        label={
          <span className="flex items-center justify-between">
            {t("password")}
            <Link href="/forgot" className="text-xs font-medium text-brand-600 hover:underline">
              {t("forgotLink")}
            </Link>
          </span>
        }
        htmlFor="password"
      >
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Status state={state} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {t("login")}
      </Button>
    </form>
  );
}

export function SetupForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(setupAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label={t("name")} htmlFor="name">
        <Input id="name" name="name" required autoFocus />
      </Field>
      <Field label={t("email")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label={t("password")} htmlFor="password" hint={t("passwordTooShort")}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Status state={state} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {t("setupSubmit")}
      </Button>
    </form>
  );
}

export function ForgotForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(forgotAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label={t("email")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Status state={state} />
      <Button type="submit" size="lg" className="w-full" disabled={pending || !!state?.success}>
        {t("forgotSubmit")}
      </Button>
      <BackToLogin />
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(resetAction, undefined);
  if (state?.success) {
    return (
      <div className="space-y-4">
        <Status state={state} />
        <BackToLogin />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label={t("newPassword")} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
      </Field>
      <Field label={t("confirmPassword")} htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Status state={state} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {t("resetSubmit")}
      </Button>
    </form>
  );
}

function BackToLogin() {
  const t = useTranslations("auth");
  return (
    <p className="text-center text-sm">
      <Link href="/login" className="font-medium text-brand-600 hover:underline">
        ← {t("backToLogin")}
      </Link>
    </p>
  );
}
