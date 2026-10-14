"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, ExternalLink } from "lucide-react";

export function CopyLink({ slug }: { slug: string }) {
  const tc = useTranslations("common");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/c/${slug}`;

  return (
    <div className="mt-1.5 flex items-center gap-2 text-sm">
      <a href={`/c/${slug}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 font-mono text-muted hover:text-brand-700">
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{url}</span>
      </a>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-pine-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? tc("copied") : tc("copy")}
      </button>
    </div>
  );
}
