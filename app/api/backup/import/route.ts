import { errorResponse, json, requireAdminRequest } from "@/lib/backup/api";
import { importBackup } from "@/lib/backup/service";

/** The file is the raw request body, streamed to disk: backups can be larger than memory. */
export async function POST(request: Request) {
  const denied = await requireAdminRequest(request, true);
  if (denied) return denied;
  if (!request.body) return json({ error: "invalidFile" }, 422);
  try {
    return json({ name: await importBackup(request.body, Number(request.headers.get("content-length")) || 0) });
  } catch (e) {
    return errorResponse(e);
  }
}
