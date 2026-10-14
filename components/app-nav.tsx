"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart3, CalendarHeart, LogOut, Menu, Plus, Settings, ShieldCheck, Users, X } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { cn } from "@/lib/utils";

export function AppNav({ appName, user }: { appName: string; user: { name: string; email: string; role: string } }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/dashboard", label: t("dashboard"), icon: CalendarHeart, exact: false },
    ...(user.role === "admin"
      ? [
          { href: "/admin/stats", label: t("stats"), icon: BarChart3, exact: false },
          { href: "/admin/users", label: t("users"), icon: Users, exact: false },
          { href: "/admin/settings/security", label: t("security"), icon: ShieldCheck, exact: false },
          { href: "/admin/settings/general", label: t("settings"), icon: Settings, exact: false },
        ]
      : []),
  ];

  const isActive = (href: string) =>
    href === "/admin/settings/general"
      ? pathname.startsWith("/admin/settings") && !pathname.endsWith("/security")
      : pathname === href || pathname.startsWith(`${href}/`);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      <Link
        href="/dashboard/new"
        onClick={() => setOpen(false)}
        className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition hover:bg-brand-700"
      >
        <Plus className="h-4 w-4" /> {t("newCalendar")}
      </Link>
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
            isActive(href) ? "bg-brand-50 text-brand-700" : "text-stone-600 hover:bg-stone-100 hover:text-ink",
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
      <div className="mt-auto space-y-3 border-t border-line pt-4">
        <div className="flex items-center gap-3 px-1">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-pine-600 text-sm font-bold uppercase text-white">
            {user.name.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-xs text-muted">{user.email}</div>
          </div>
        </div>
        <div className="flex items-center justify-between px-1">
          <LocaleSwitcher />
          <form action={logoutAction}>
            <button type="submit" className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-brand-700">
              <LogOut className="h-3.5 w-3.5" /> {tc("logout")}
            </button>
          </form>
        </div>
      </div>
    </nav>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="text-xl">🎄</span> {appName}
        </Link>
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-stone-100" aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="font-semibold">🎄 {appName}</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-stone-100" aria-label={tc("close")}>
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-white/90 p-4 backdrop-blur lg:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2.5 px-1">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-lg shadow-sm">🎄</span>
          <span className="font-semibold leading-tight">{appName}</span>
        </Link>
        {nav}
      </aside>
    </>
  );
}
