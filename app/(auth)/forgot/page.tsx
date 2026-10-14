import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui";
import { getSetting } from "@/lib/settings";
import { AuthShell } from "../auth-shell";
import { ForgotForm } from "../forms";

export default async function ForgotPage() {
  const t = await getTranslations("auth");
  const auth = await getSetting("auth");
  return (
    <AuthShell title={t("forgotTitle")} subtitle={t("forgotSubtitle")}>
      {auth.forgotPasswordEnabled ? <ForgotForm /> : <Alert tone="warning">{t("forgotDisabled")}</Alert>}
    </AuthShell>
  );
}
