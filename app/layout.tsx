import type { Metadata, Viewport } from "next";
// Fonts are bundled from npm (no request to Google at build time or runtime).
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/playfair-display";
import "@fontsource-variable/caveat";
import "@fontsource/mountains-of-christmas/400.css";
import "@fontsource/mountains-of-christmas/700.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { getClientIp, ipDecision } from "@/lib/security/guard";
import { getSetting } from "@/lib/settings";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const general = await getSetting("general");
  return {
    title: { default: general.appName, template: `%s · ${general.appName}` },
    icons: { icon: "/icon.svg" },
  };
}

export const viewport: Viewport = { themeColor: "#c8102e", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const denied = (await ipDecision(await getClientIp())) === "deny";
  const t = await getTranslations("common");

  return (
    <html lang={locale}>
      <body className="min-h-dvh">
        {denied ? (
          <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
            <div className="text-6xl">⛔</div>
            <h1 className="mt-4 text-2xl font-bold">{t("forbidden")}</h1>
            <p className="mt-2 text-muted">{t("forbiddenDesc")}</p>
          </main>
        ) : (
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        )}
      </body>
    </html>
  );
}
