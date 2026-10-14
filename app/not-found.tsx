import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("public");
  return (
    <main className="festive-bg flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl">🎄</div>
      <h1 className="mt-4 text-2xl font-bold">404</h1>
      <p className="mt-2 text-muted">{t("notFoundDesc")}</p>
      <Link href="/" className="mt-6 font-medium text-brand-600 hover:underline">
        ←
      </Link>
    </main>
  );
}
