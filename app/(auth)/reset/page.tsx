import { getTranslations } from "next-intl/server";
import { AuthShell } from "../auth-shell";
import { ResetForm } from "../forms";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getTranslations("auth");
  const { token } = await searchParams;
  return (
    <AuthShell title={t("resetTitle")}>
      <ResetForm token={token ?? ""} />
    </AuthShell>
  );
}
