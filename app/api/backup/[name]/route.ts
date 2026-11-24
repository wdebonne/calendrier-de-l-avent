import fs from "node:fs";
import { Readable } from "node:stream";
import { errorResponse, json, requireAdminRequest } from "@/lib/backup/api";
import { isBusy } from "@/lib/backup/job";
import { backupPath, deleteBackup } from "@/lib/backup/service";

type Params = { params: Promise<{ name: string }> };

export async function GET(request: Request, { params }: Params) {
  const denied = await requireAdminRequest(request, false);
  if (denied) return denied;
  const { name } = await params;
  try {
    const file = backupPath(name);
    const { size } = await fs.promises.stat(/*turbopackIgnore: true*/ file);
    return new Response(Readable.toWeb(fs.createReadStream(/*turbopackIgnore: true*/ file)) as ReadableStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const denied = await requireAdminRequest(request, true);
  if (denied) return denied;
  // It could be the file being restored.
  if (isBusy()) return json({ error: "busy" }, 409);
  try {
    deleteBackup((await params).name);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
