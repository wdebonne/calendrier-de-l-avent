import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "NEXT_LOCALE";

function pick(value: string | undefined | null): Locale | null {
  if (!value) return null;
  const v = value.toLowerCase().slice(0, 2);
  return (LOCALES as readonly string[]).includes(v) ? (v as Locale) : null;
}

export default getRequestConfig(async () => {
  const jar = await cookies();
  let locale = pick(jar.get(LOCALE_COOKIE)?.value);
  if (!locale) {
    const accept = (await headers()).get("accept-language") ?? "";
    locale = accept.split(",").map((p) => pick(p.trim())).find(Boolean) ?? "fr";
  }
  const messages = locale === "en" ? (await import("../messages/en")).default : (await import("../messages/fr")).default;
  return { locale, messages, timeZone: "Europe/Paris" };
});
