import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { userCount } from "@/lib/auth/session";
import { AuthShell } from "../auth-shell";
import { SetupForm } from "../forms";

export default async function SetupPage() {
  if ((await userCount()) > 0) redirect("/login");
  const t = await getTranslations("auth");
  return (
    <AuthShell title={t("setupTitle")} subtitle={t("setupSubtitle")}>
      <SetupForm />
    </AuthShell>
  );
}
