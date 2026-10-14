"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";

/** URL field with drag-and-drop / click upload to the media library. */
export function MediaInput({
  value,
  onChange,
  accept = "image/*",
  placeholder,
  showPreview = true,
}: {
  value: string;
  onChange: (url: string) => void;
  accept?: string;
  placeholder?: string;
  showPreview?: boolean;
}) {
  const tc = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      onChange(json.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const isImage = value && (accept.startsWith("image") || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(value));
  const isVideo = value && accept.startsWith("video");

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) upload(f);
      }}
      className={cn("rounded-xl transition", drag && "ring-4 ring-brand-200")}
    >
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "https://…"} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-stone-300 px-3 text-sm font-medium text-stone-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          <span className="hidden sm:inline">{uploading ? tc("uploading") : tc("upload")}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-brand-700">{error}</p>}
      {showPreview && value && (isImage || isVideo) && (
        <div className="relative mt-2 inline-block">
          {isVideo ? (
            <video src={value} className="h-24 rounded-lg border border-line" muted />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-24 rounded-lg border border-line object-cover" />
          )}
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-white text-stone-600 shadow"
            aria-label={tc("remove")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
