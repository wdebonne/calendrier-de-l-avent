"use client";

import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { DayContent } from "@/lib/calendar/public";
import { cn } from "@/lib/utils";

export function ContentView({ content, accent, fontClass }: { content: DayContent; accent: string; fontClass?: string }) {
  const t = useTranslations("public");
  const empty = !content.url && !content.text && !content.embedUrl;

  return (
    <div className="space-y-4">
      <div className="pr-10">
        <div className={cn("text-4xl font-bold", fontClass)} style={{ color: accent }}>
          {content.number}
        </div>
        {content.label && <h2 className="mt-1 text-xl font-bold">{content.label}</h2>}
      </div>

      {content.message && (
        <div className="rounded-xl bg-pine-50 px-4 py-2 text-sm font-medium text-pine-700">{content.message}</div>
      )}

      {content.type === "image" && content.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={content.url} alt={content.label ?? ""} className="max-h-[60dvh] w-full rounded-2xl bg-stone-100 object-contain" />
      )}

      {content.type === "video" && content.url && (
        <video src={content.url} controls autoPlay playsInline className="max-h-[60dvh] w-full rounded-2xl bg-black" />
      )}

      {(content.type === "youtube" || content.type === "vimeo") && content.embedUrl && (
        <div className="aspect-video overflow-hidden rounded-2xl bg-black">
          <iframe
            src={content.embedUrl}
            title={content.label ?? "video"}
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          />
        </div>
      )}

      {(content.type === "youtube" || content.type === "vimeo") && !content.embedUrl && content.url && (
        <LinkCard url={content.url} accent={accent} label={t("openLink")} />
      )}

      {content.type === "link" && content.url && <LinkCard url={content.url} accent={accent} label={t("openLink")} />}

      {content.text && <p className="whitespace-pre-line text-base leading-relaxed text-stone-700">{content.text}</p>}

      {empty && <p className="py-6 text-center text-stone-500">{t("noContent")}</p>}
    </div>
  );
}

function LinkCard({ url, accent, label }: { url: string; accent: string; label: string }) {
  let host = url;
  try {
    host = new URL(url, "https://x").hostname;
  } catch {
    /* keep raw */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-stone-50 p-4 transition hover:shadow-md"
    >
      <div className="min-w-0">
        <div className="truncate text-sm text-muted">{host}</div>
        <div className="font-semibold">{label}</div>
      </div>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: accent }}>
        <ExternalLink className="h-5 w-5" />
      </span>
    </a>
  );
}
