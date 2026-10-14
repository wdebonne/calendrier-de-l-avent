"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Copy, ExternalLink, MoreVertical, Trash2, Files } from "lucide-react";
import { deleteCalendarAction, duplicateCalendarAction } from "./actions";

export function CalendarCardMenu({ id, slug }: { id: string; slug: string }) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const tcal = useTranslations("calendar");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const url = typeof window !== "undefined" ? `${window.location.origin}/c/${slug}` : `/c/${slug}`;
  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
        aria-label={tc("actions")}
        disabled={pending}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-10 w-56 rounded-xl border border-line bg-white p-1 shadow-lift">
          <a href={`/c/${slug}`} target="_blank" rel="noreferrer" className={item}>
            <ExternalLink className="h-4 w-4" /> {tcal("publicLink")}
          </a>
          <button
            type="button"
            className={item}
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy className="h-4 w-4" /> {copied ? tc("copied") : tc("copy")}
          </button>
          <button type="button" className={item} onClick={() => start(() => duplicateCalendarAction(id))}>
            <Files className="h-4 w-4" /> {t("duplicate")}
          </button>
          <button
            type="button"
            className={`${item} text-brand-700 hover:bg-brand-50`}
            onClick={() => {
              if (confirm(tcal("deleteConfirm"))) start(() => deleteCalendarAction(id));
            }}
          >
            <Trash2 className="h-4 w-4" /> {tc("delete")}
          </button>
        </div>
      )}
    </div>
  );
}
