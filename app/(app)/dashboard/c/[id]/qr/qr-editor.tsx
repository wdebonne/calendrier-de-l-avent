"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2, Printer, Save } from "lucide-react";
import type QRCodeStyling from "qr-code-styling";
import type { Options } from "qr-code-styling";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Toggle } from "@/components/ui";
import { MediaInput } from "@/components/media-input";
import { saveQrConfigAction } from "../../../actions";

export interface QrConfig {
  fg: string;
  fg2: string;
  gradient: boolean;
  bg: string;
  transparent: boolean;
  cornerColor: string;
  dotType: string;
  cornerType: string;
  cornerDotType: string;
  logo: "none" | "tree" | "custom";
  logoUrl: string;
  logoSize: number;
  margin: number;
  ecl: "L" | "M" | "Q" | "H";
  caption: string;
}

const DEFAULTS: QrConfig = {
  fg: "#9f1239",
  fg2: "#166534",
  gradient: true,
  bg: "#ffffff",
  transparent: false,
  cornerColor: "#14532d",
  dotType: "rounded",
  cornerType: "extra-rounded",
  cornerDotType: "dot",
  logo: "tree",
  logoUrl: "",
  logoSize: 0.3,
  margin: 12,
  ecl: "H",
  caption: "",
};

const DOT_TYPES = ["square", "dots", "rounded", "classy", "classy-rounded", "extra-rounded"] as const;
const CORNER_TYPES = ["square", "dot", "extra-rounded"] as const;

function buildOptions(cfg: QrConfig, data: string, size: number): Options {
  const image = cfg.logo === "tree" ? "/icon.svg" : cfg.logo === "custom" && cfg.logoUrl ? cfg.logoUrl : undefined;
  return {
    width: size,
    height: size,
    type: "svg",
    data,
    margin: cfg.margin,
    image,
    qrOptions: { errorCorrectionLevel: cfg.ecl },
    imageOptions: { crossOrigin: "anonymous", margin: 6, imageSize: cfg.logoSize, hideBackgroundDots: true },
    dotsOptions: cfg.gradient
      ? {
          type: cfg.dotType as never,
          gradient: { type: "linear", rotation: Math.PI / 4, colorStops: [{ offset: 0, color: cfg.fg }, { offset: 1, color: cfg.fg2 }] },
        }
      : { type: cfg.dotType as never, color: cfg.fg },
    cornersSquareOptions: { type: cfg.cornerType as never, color: cfg.cornerColor },
    cornersDotOptions: { type: cfg.cornerDotType as never, color: cfg.cornerColor },
    backgroundOptions: { color: cfg.transparent ? "transparent" : cfg.bg },
  };
}

export function QrEditor({
  calendarId,
  slug,
  title,
  baseUrl,
  initial,
}: {
  calendarId: string;
  slug: string;
  title: string;
  baseUrl: string | null;
  initial: Partial<QrConfig>;
}) {
  const t = useTranslations("qr");
  const tc = useTranslations("common");
  const [cfg, setCfg] = useState<QrConfig>({ ...DEFAULTS, caption: title, ...initial });
  const [origin, setOrigin] = useState(baseUrl ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const container = useRef<HTMLDivElement>(null);
  const qr = useRef<QRCodeStyling | null>(null);
  const set = (patch: Partial<QrConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
    setStatus(null);
  };

  useEffect(() => {
    if (!baseUrl) setOrigin(window.location.origin);
  }, [baseUrl]);

  const data = useMemo(() => (origin ? `${origin}/c/${slug}?src=qr` : ""), [origin, slug]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      const { default: QRCodeStylingCtor } = await import("qr-code-styling");
      if (cancelled || !container.current) return;
      const options = buildOptions(cfg, data, 1024);
      if (!qr.current) {
        qr.current = new QRCodeStylingCtor(options);
        container.current.innerHTML = "";
        qr.current.append(container.current);
      } else {
        qr.current.update(options);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cfg, data]);

  async function download(extension: "png" | "svg" | "jpeg" | "webp") {
    if (!qr.current) return;
    const { default: QRCodeStylingCtor } = await import("qr-code-styling");
    // Raster formats are rendered on a canvas at high resolution.
    const exporter = new QRCodeStylingCtor({ ...buildOptions(cfg, data, 2048), type: extension === "svg" ? "svg" : "canvas" });
    await exporter.download({ name: `qr-${slug}`, extension });
  }

  async function print() {
    if (!qr.current) return;
    const blob = (await qr.current.getRawData("svg")) as Blob | null;
    if (!blob) return;
    const svg = await blob.text();
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const caption = cfg.caption.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
    w.document.write(
      `<!doctype html><html><head><title>${caption || "QR"}</title><style>body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0}svg{width:12cm;height:12cm}h1{font-size:28px;margin:24px 0 0;text-align:center}</style></head><body>${svg}${caption ? `<h1>${caption}</h1>` : ""}<script>window.onload=()=>{window.print()}</script></body></html>`,
    );
    w.document.close();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5">
        <Card>
          <CardHeader title={t("title")} description={t("subtitle")} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <ColorInput label={t("foreground")} value={cfg.fg} onChange={(fg) => set({ fg })} />
            <ColorInput label={t("cornerColor")} value={cfg.cornerColor} onChange={(cornerColor) => set({ cornerColor })} />
            <div className="space-y-3">
              <Toggle label={t("gradient")} checked={cfg.gradient} onChange={(e) => set({ gradient: e.target.checked })} />
              {cfg.gradient && <ColorInput label={t("gradientColor")} value={cfg.fg2} onChange={(fg2) => set({ fg2 })} />}
            </div>
            <div className="space-y-3">
              <Toggle label={t("transparent")} checked={cfg.transparent} onChange={(e) => set({ transparent: e.target.checked })} />
              {!cfg.transparent && <ColorInput label={t("background")} value={cfg.bg} onChange={(bg) => set({ bg })} />}
            </div>
          </div>
        </Card>

        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label={t("dotStyle")}>
            <Select value={cfg.dotType} onChange={(e) => set({ dotType: e.target.value })}>
              {DOT_TYPES.map((d) => (
                <option key={d} value={d}>
                  {t(`dots.${d}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("cornerStyle")}>
            <Select value={cfg.cornerType} onChange={(e) => set({ cornerType: e.target.value })}>
              {CORNER_TYPES.map((d) => (
                <option key={d} value={d}>
                  {t(`corners.${d}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("cornerDotStyle")}>
            <Select value={cfg.cornerDotType} onChange={(e) => set({ cornerDotType: e.target.value })}>
              {(["square", "dot"] as const).map((d) => (
                <option key={d} value={d}>
                  {t(`corners.${d}`)}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <Field label={t("logo")}>
            <Select value={cfg.logo} onChange={(e) => set({ logo: e.target.value as QrConfig["logo"] })}>
              <option value="none">{t("logoNone")}</option>
              <option value="tree">{t("logoEmoji")}</option>
              <option value="custom">{t("logoCustom")}</option>
            </Select>
          </Field>
          {cfg.logo === "custom" && <MediaInput value={cfg.logoUrl} onChange={(logoUrl) => set({ logoUrl })} />}
          <div className="grid gap-4 sm:grid-cols-3">
            {cfg.logo !== "none" && (
              <Field label={`${t("logoSize")} (${Math.round(cfg.logoSize * 100)} %)`}>
                <input
                  type="range"
                  min={0.1}
                  max={0.45}
                  step={0.05}
                  value={cfg.logoSize}
                  onChange={(e) => set({ logoSize: Number(e.target.value) })}
                  className="w-full accent-brand-600"
                />
              </Field>
            )}
            <Field label={`${t("margin")} (${cfg.margin})`}>
              <input
                type="range"
                min={0}
                max={60}
                value={cfg.margin}
                onChange={(e) => set({ margin: Number(e.target.value) })}
                className="w-full accent-brand-600"
              />
            </Field>
            <Field label={t("errorLevel")}>
              <Select value={cfg.ecl} onChange={(e) => set({ ecl: e.target.value as QrConfig["ecl"] })}>
                <option value="L">L (7 %)</option>
                <option value="M">M (15 %)</option>
                <option value="Q">Q (25 %)</option>
                <option value="H">H (30 %)</option>
              </Select>
            </Field>
          </div>
          <Field label={t("caption")}>
            <Input value={cfg.caption} onChange={(e) => set({ caption: e.target.value })} maxLength={120} />
          </Field>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="p-5">
          <div
            ref={container}
            className="mx-auto aspect-square w-full max-w-72 [&>svg]:h-full [&>svg]:w-full"
            style={{
              background: cfg.transparent ? "repeating-conic-gradient(#f5f5f4 0% 25%, #fff 0% 50%) 50% / 16px 16px" : undefined,
            }}
          />
          <div className="mt-4 rounded-xl bg-stone-50 p-3">
            <div className="text-xs font-medium text-muted">{t("encodedUrl")}</div>
            <div className="mt-0.5 break-all font-mono text-xs">{data}</div>
            <p className="mt-2 text-[11px] text-muted">{t("trackingHint")}</p>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-2">
          {(["png", "svg", "jpeg", "webp"] as const).map((ext) => (
            <Button key={ext} type="button" variant="outline" onClick={() => download(ext)}>
              <Download className="h-4 w-4" /> {ext.toUpperCase()}
            </Button>
          ))}
        </div>
        <Button type="button" variant="secondary" className="w-full" onClick={print}>
          <Printer className="h-4 w-4" /> {t("print")}
        </Button>
        {status && <Alert tone="success">{status}</Alert>}
        <Button
          type="button"
          className="w-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveQrConfigAction(calendarId, cfg);
              setStatus(res?.success ?? tc("saved"));
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("saveConfig")}
        </Button>
      </div>
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white p-1"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" maxLength={9} />
      </div>
    </Field>
  );
}
