import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getDb } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/env";

// Media ids are random UUIDs: a file is only reachable by someone who was given its URL,
// which the public API only hands out once a day has been legitimately opened.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const media = await db.selectFrom("media").select(["filename", "mime"]).where("id", "=", id).executeTakeFirst();
  if (!media) return new Response("Not found", { status: 404 });

  const file = path.join(UPLOAD_DIR, path.basename(media.filename));
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(file);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": media.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  };

  // Range requests are needed for video seeking (Safari requires them).
  const range = request.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
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
