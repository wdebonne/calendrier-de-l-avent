"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Download, ExternalLink, Loader2, Maximize2, Minimize2, MoveHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { cn } from "@/lib/utils";

type PdfJs = typeof import("pdfjs-dist");

const BASE = "/pdfjs";
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
// iOS Safari refuses canvases above ~16.7 million pixels.
const MAX_CANVAS_PIXELS = 16_000_000;

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Loaded from our own public folder, only when a PDF is actually opened. */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    const url = `${BASE}/pdf.min.mjs`;
    pdfjsPromise = (import(/* turbopackIgnore: true */ /* webpackIgnore: true */ url) as Promise<PdfJs>).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;
      return lib;
    });
    // Let a later attempt retry after a network failure.
    pdfjsPromise.catch(() => {
      pdfjsPromise = null;
    });
  }
  return pdfjsPromise;
}

const isLocal = (url: string) => url.startsWith("/api/media/");

export function PdfViewer({ url, title, accent }: { url: string; title?: string | null; accent: string }) {
  const t = useTranslations("pdf");
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const pageRef = useRef(1);

  useEffect(() => {
    // Other sites almost never allow cross-origin reading: those PDFs open in a new tab.
    if (!isLocal(url)) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    let destroy: (() => void) | null = null;
    setDoc(null);
    setFailed(false);
    pageRef.current = 1;
    loadPdfJs()
      .then((lib) => {
        if (cancelled) return;
        const task = lib.getDocument({
          url,
          cMapUrl: `${BASE}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${BASE}/standard_fonts/`,
          wasmUrl: `${BASE}/wasm/`,
          // JavaScript decoders, so the site's CSP does not have to allow WebAssembly.
          useWasm: false,
        });
        destroy = () => void task.destroy();
        return task.promise.then((d) => {
          if (!cancelled) setDoc(d);
        });
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn("[pdf]", e);
        setFailed(true);
      });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);

  useEffect(() => {
    if (!fullscreen) return;
    // Capture phase: Escape leaves full screen without also closing the door's window.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setFullscreen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [fullscreen]);

  if (failed) {
    return (
      <div className="rounded-2xl border border-line bg-stone-50 p-5 text-center">
        <div className="text-4xl">📄</div>
        {isLocal(url) && <p className="mt-2 text-sm text-stone-600">{t("error")}</p>}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl px-5 font-semibold text-white"
          style={{ background: accent }}
        >
          <ExternalLink className="h-4 w-4" /> {t("openPdf")}
        </a>
      </div>
    );
  }

  const viewer = (
    <Viewer
      key={fullscreen ? "full" : "inline"}
      doc={doc}
      url={url}
      title={title}
      fullscreen={fullscreen}
      pageRef={pageRef}
      onToggleFullscreen={() => setFullscreen((f) => !f)}
    />
  );

  // A portal, because the window is animated with a transform that would trap a fixed child.
  // (The Fullscreen API is not available to web pages on iPhone.)
  return fullscreen ? createPortal(<div className="fixed inset-0 z-[60] bg-stone-800">{viewer}</div>, document.body) : viewer;
}

function Viewer({
  doc,
  url,
  title,
  fullscreen,
  pageRef,
  onToggleFullscreen,
}: {
  doc: PDFDocumentProxy | null;
  url: string;
  title?: string | null;
  fullscreen: boolean;
  pageRef: React.RefObject<number>;
  onToggleFullscreen: () => void;
}) {
  const t = useTranslations("pdf");
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(pageRef.current);
  const [ratio, setRatio] = useState<number | null>(null);
  const total = doc?.numPages ?? 0;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The first page gives the placeholder size of the others until they are loaded.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    doc
      .getPage(1)
      .then((p) => {
        const v = p.getViewport({ scale: 1 });
        if (!cancelled) setRatio(v.height / v.width);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const pageElement = (n: number) => scroller.current?.querySelector<HTMLElement>(`[data-page="${n}"]`) ?? null;

  // Stay on the same page when entering / leaving full screen, zooming or rotating the device.
  const ready = ratio !== null && width > 0;
  useLayoutEffect(() => {
    if (!ready || !scroller.current) return;
    const el = pageElement(pageRef.current);
    if (el) scroller.current.scrollTop = el.offsetTop - 8;
  }, [ready, width, zoom, pageRef]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const middle = el.scrollTop + el.clientHeight / 2;
    let current = 1;
    for (const p of el.querySelectorAll<HTMLElement>("[data-page]")) {
      if (p.offsetTop <= middle) current = Number(p.dataset.page);
      else break;
    }
    pageRef.current = current;
    setPage(current);
  }

  const setZoomClamped = (z: number) => setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 4) / 4)));
  const maxWidth = fullscreen ? 1100 : 900;
  const pageWidth = Math.max(0, Math.min(width - 16, maxWidth)) * zoom;
  const button =
    "grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white transition hover:bg-white/15 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

  return (
    <div className={cn("flex flex-col overflow-hidden bg-stone-800", fullscreen ? "h-dvh" : "h-[62dvh] rounded-2xl")}>
      <div
        className="flex items-center gap-0.5 bg-stone-900 px-2 py-1 text-white"
        style={fullscreen ? { paddingTop: "max(0.25rem, env(safe-area-inset-top))" } : undefined}
      >
        <span className="mr-auto whitespace-nowrap px-1 text-xs tabular-nums sm:text-sm" aria-live="polite">
          {total > 0 && t("page", { page, total })}
        </span>
        <button type="button" className={button} onClick={() => setZoomClamped(zoom - 0.5)} disabled={zoom <= MIN_ZOOM} aria-label={t("zoomOut")} title={t("zoomOut")}>
          <ZoomOut className="h-5 w-5" />
        </button>
        <button type="button" className={button} onClick={() => setZoomClamped(zoom + 0.5)} disabled={zoom >= MAX_ZOOM} aria-label={t("zoomIn")} title={t("zoomIn")}>
          <ZoomIn className="h-5 w-5" />
        </button>
        <button type="button" className={cn(button, "hidden sm:grid")} onClick={() => setZoom(1)} disabled={zoom === 1} aria-label={t("fit")} title={t("fit")}>
          <MoveHorizontal className="h-5 w-5" />
        </button>
        <a href={`${url}?download=1`} className={button} aria-label={t("download")} title={t("download")}>
          <Download className="h-5 w-5" />
        </a>
        <button
          type="button"
          className={button}
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? t("exitFullscreen") : t("fullscreen")}
          title={fullscreen ? t("exitFullscreen") : t("fullscreen")}
        >
          {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        tabIndex={0}
        role="document"
        aria-label={title || "PDF"}
        className="relative flex-1 overflow-auto overscroll-contain outline-none"
        style={{ touchAction: "pan-x pan-y pinch-zoom" }}
      >
        {!doc || !ready ? (
          <div className="grid h-full place-items-center text-sm text-white/80">
            <span className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> {t("loading")}
            </span>
          </div>
        ) : (
          <div className="mx-auto w-max min-w-full space-y-2 p-2">
            {Array.from({ length: total }, (_, i) => (
              <PdfPage key={i} doc={doc} number={i + 1} width={pageWidth} fallbackRatio={ratio} root={scroller} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders a page only while it is near the viewport, so long PDFs stay light on phones. */
function PdfPage({
  doc,
  number,
  width,
  fallbackRatio,
  root,
}: {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  fallbackRatio: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [links, setLinks] = useState<{ url: string; left: number; top: number; width: number; height: number }[]>([]);

  useEffect(() => {
    if (!holder.current) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: root.current,
      rootMargin: "600px 0px",
    });
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!near || page) return;
    let cancelled = false;
    doc
      .getPage(number)
      .then((p) => !cancelled && setPage(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [near, page, doc, number]);

  const base = page?.getViewport({ scale: 1 });
  const ratio = base ? base.height / base.width : fallbackRatio;
  const height = width * ratio;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page || width <= 0) return;
    const unit = page.getViewport({ scale: 1 });
    const cssScale = width / unit.width;
    const wanted = cssScale * Math.min(window.devicePixelRatio || 1, 3);
    const limit = Math.sqrt(MAX_CANVAS_PIXELS / (unit.width * unit.height));
    const viewport = page.getViewport({ scale: Math.min(wanted, limit) });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    return page.render({ canvas, viewport });
  }, [page, width]);

  useEffect(() => {
    if (!near) return;
    const task = render();
    if (!task) return;
    task.promise.catch(() => {
      /* cancelled by a zoom, or an unreadable page */
    });
    const canvas = canvasRef.current;
    return () => {
      task.cancel();
      // Frees the bitmap right away: iOS limits the total canvas memory.
      if (canvas) canvas.width = canvas.height = 0;
    };
  }, [near, render]);

  // Links placed in the PDF stay clickable (PDF.js only exposes safe http/mailto/tel URLs here).
  useEffect(() => {
    if (!near || !page) return;
    let cancelled = false;
    page
      .getAnnotations()
      .then((annotations) => {
        if (cancelled) return;
        const unit = page.getViewport({ scale: 1 });
        setLinks(
          annotations
            .filter((a) => a.subtype === "Link" && typeof a.url === "string")
            .map((a) => {
              const [x1, y1] = unit.convertToViewportPoint(a.rect[0], a.rect[1]);
              const [x2, y2] = unit.convertToViewportPoint(a.rect[2], a.rect[3]);
              return {
                url: a.url as string,
                left: (Math.min(x1, x2) / unit.width) * 100,
                top: (Math.min(y1, y2) / unit.height) * 100,
                width: (Math.abs(x2 - x1) / unit.width) * 100,
                height: (Math.abs(y2 - y1) / unit.height) * 100,
              };
            }),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [near, page]);

  return (
    <div ref={holder} data-page={number} className="relative mx-auto bg-white shadow-lg" style={{ width, height }}>
      {near && <canvas ref={canvasRef} className="block h-full w-full" />}
      {links.map((l, i) => (
        <a
          key={i}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={l.url}
          className="absolute rounded-sm hover:bg-sky-400/20"
          style={{ left: `${l.left}%`, top: `${l.top}%`, width: `${l.width}%`, height: `${l.height}%` }}
        />
      ))}
    </div>
  );
}
