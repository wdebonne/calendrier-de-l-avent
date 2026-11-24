import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getDb } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/env";

/** Keeps the original file name (accents included) without letting it break the header. */
function contentDisposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "file";
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// Media ids are random UUIDs: a file is only reachable by someone who was given its URL,
// which the public API only hands out once a day has been legitimately opened.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const media = await db.selectFrom("media").select(["filename", "mime", "original_name"]).where("id", "=", id).executeTakeFirst();
  if (!media) return new Response("Not found", { status: 404 });

  const file = path.join(UPLOAD_DIR, path.basename(media.filename));
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(file);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": media.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": contentDisposition(download ? "attachment" : "inline", media.original_name),
  };

  // Range requests are needed for video seeking (Safari requires them).
  const range = request.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m && (m[1] || m[2])) {
      // "bytes=-500" asks for the last 500 bytes.
      const suffix = !m[1];
      const start = suffix ? Math.max(0, stat.size - Number(m[2])) : Number(m[1]);
      const end = m[2] && !suffix ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
      if (start <= end && start < stat.size) {
        const stream = fs.createReadStream(file, { start, end });
        return new Response(Readable.toWeb(stream) as ReadableStream, {
          status: 206,
          headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(end - start + 1) },
        });
      }
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
  }
  const stream = fs.createReadStream(file);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: { ...headers, "Content-Length": String(stat.size) },
  });
}
