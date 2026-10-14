import { getTranslations } from "next-intl/server";
import { getSetting } from "@/lib/settings";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Snow } from "@/components/calendar/snow";

export async function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const general = await getSetting("general");
  const t = await getTranslations("auth");
  const doors = [3, 17, 8, 24, 12, 1, 20, 6, 15];
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-600 to-pine-700 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Snow count={40} />
        <div className="relative z-10 flex items-center gap-3 text-white">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 text-2xl backdrop-blur">🎄</span>
          <span className="text-lg font-semibold">{general.appName}</span>
        </div>
        <div className="relative z-10 mx-auto grid w-full max-w-sm grid-cols-3 gap-3">
          {doors.map((d, i) => (
            <div
              key={d}
              className="grid aspect-square place-items-center rounded-2xl border border-white/30 bg-white/10 font-festive text-3xl font-bold text-gold-300 shadow-lg backdrop-blur-sm animate-float"
              style={{ animationDelay: `${i * 0.35}s` }}
            >
              {d}
            </div>
          ))}
        </div>
        <p className="relative z-10 max-w-md font-festive text-3xl leading-tight text-white">
          {t("tagline")}
        </p>
      </aside>
      <main className="festive-bg flex flex-col">
        <div className="flex justify-end p-4">
          <LocaleSwitcher />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">
            <div className="mb-8 lg:hidden text-center text-4xl">🎄</div>
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
