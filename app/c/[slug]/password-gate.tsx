"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Loader2, Lock } from "lucide-react";
import { Snow } from "@/components/calendar/snow";
import { FONT_CLASS } from "@/components/calendar/calendar-view";
import type { CalendarTheme } from "@/lib/calendar/theme";
import { cn } from "@/lib/utils";

export function PasswordGate({ slug, title, theme }: { slug: string; title: string; theme: CalendarTheme }) {
  const t = useTranslations("public");
  const ta = useTranslations("auth");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shake, setShake] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch(`/api/c/${slug}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    setShake((s) => s + 1);
    if (res.status === 429) {
      const minutes = json.until ? Math.max(1, Math.ceil((new Date(json.until).getTime() - Date.now()) / 60000)) : 15;
      setError(ta("blocked", { minutes }));
    } else setError(t("wrongPassword"));
  }

  return (
    <main
      className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden p-6"
      style={{ background: theme.background, color: theme.text }}
    >
      {theme.backgroundImage && (
        <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url("${theme.backgroundImage}")` }} />
      )}
      {theme.snow && <Snow count={40} />}
      <motion.form
        key={shake}
        onSubmit={submit}
        animate={shake ? { x: [0, -12, 12, -8, 8, 0] } : { opacity: 1, y: 0 }}
        initial={shake ? undefined : { opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-sm rounded-3xl bg-white/95 p-8 text-center text-ink shadow-2xl backdrop-blur"
      >
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl text-white shadow-lg" style={{ background: "#c8102e" }}>
          <Lock className="h-7 w-7" />
        </div>
        <h1 className={cn("mt-5 text-3xl font-bold", FONT_CLASS[theme.font])}>{title}</h1>
        <p className="mt-2 text-sm text-muted">{t("passwordSubtitle")}</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
          aria-label={t("passwordTitle")}
          className="mt-6 h-12 w-full rounded-xl border-2 border-line px-4 text-center text-lg outline-none focus:border-brand-400"
        />
        {error && <p className="mt-3 text-sm font-medium text-brand-700">{error}</p>}
        <button
          type="submit"
          disabled={pending || !password}
          className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white shadow-md transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("passwordSubmit")} 🎄
        </button>
      </motion.form>
    </main>
  );
}
