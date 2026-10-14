import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { newId, nowIso } from "@/lib/utils";

// SVG is deliberately excluded (it can carry scripts).
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { maxUploadMb } = await getSetting("general");
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size > maxUploadMb * 1024 * 1024) {
    return NextResponse.json({ error: `max ${maxUploadMb} MB` }, { status: 413 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: "unsupported type" }, { status: 415 });

  const id = newId();
  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  let mime = file.type;
  let finalExt = ext;

  if (["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
    // Re-encoding strips metadata (GPS…), fixes orientation and validates it is a real image.
    try {
      const img = sharp(buffer, { failOn: "error" }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true });
      if (file.type === "image/png") {
        buffer = await img.png({ compressionLevel: 9 }).toBuffer();
      } else {
        buffer = await img.webp({ quality: 85 }).toBuffer();
        mime = "image/webp";
        finalExt = "webp";
      }
    } catch {
      return NextResponse.json({ error: "invalid image" }, { status: 415 });
    }
  }

  const filename = `${id}.${finalExt}`;
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, filename), buffer);
  const db = await getDb();
  await db
    .insertInto("media")
    .values({
      id,
      owner_id: user.id,
      filename,
      original_name: file.name.slice(0, 200),
      mime,
      size: buffer.length,
      created_at: nowIso(),
    })
    .execute();

  return NextResponse.json({ id, url: `/api/media/${id}`, mime, size: buffer.length });
}
