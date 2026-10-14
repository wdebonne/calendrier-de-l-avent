import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, userCount } from "@/lib/auth/session";
import { AuthShell } from "../auth-shell";
import { LoginForm } from "../forms";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if ((await userCount()) === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/dashboard");
  const t = await getTranslations("auth");
  const { next } = await searchParams;
  return (
    <AuthShell title={t("loginTitle")} subtitle={t("loginSubtitle")}>
      <LoginForm next={next} />
    </AuthShell>
  );
}
