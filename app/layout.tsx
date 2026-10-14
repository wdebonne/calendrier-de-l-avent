import type { Metadata, Viewport } from "next";
import { Caveat, Mountains_of_Christmas, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { getClientIp, ipDecision } from "@/lib/security/guard";
import { getSetting } from "@/lib/settings";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const festive = Mountains_of_Christmas({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-festive",
  display: "swap",
});
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat", display: "swap" });

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
    <html lang={locale} className={`${jakarta.variable} ${festive.variable} ${playfair.variable} ${caveat.variable}`}>
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
