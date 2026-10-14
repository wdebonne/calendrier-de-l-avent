import type fr from "./messages/fr";

declare module "next-intl" {
  interface AppConfig {
    Messages: typeof fr;
    Locale: "fr" | "en";
  }
}
