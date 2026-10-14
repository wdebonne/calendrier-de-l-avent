"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BarChart3, Gift, Palette, QrCode, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function CalendarTabs({ id }: { id: string }) {
  const t = useTranslations("calendar.tabs");
  const pathname = usePathname();
  const tabs = [
    { slug: "days", label: t("days"), icon: Gift },
    { slug: "appearance", label: t("appearance"), icon: Palette },
    { slug: "settings", label: t("settings"), icon: Settings2 },
    { slug: "qr", label: t("qr"), icon: QrCode },
    { slug: "stats", label: t("stats"), icon: BarChart3 },
  ];
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <nav className="inline-flex min-w-full gap-1 rounded-2xl border border-line bg-white p-1 shadow-soft sm:min-w-0">
        {tabs.map(({ slug, label, icon: Icon }) => {
          const href = `/dashboard/c/${id}/${slug}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={slug}
              href={href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition",
                active ? "bg-ink text-white shadow-sm" : "text-stone-600 hover:bg-stone-100",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
