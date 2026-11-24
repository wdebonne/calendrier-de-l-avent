import { errorResponse, json, requireAdminRequest } from "@/lib/backup/api";
import { jobState, startJob } from "@/lib/backup/job";
import { backupPath, createBackup, restoreBackup } from "@/lib/backup/service";
import { PASSWORD_MIN } from "@/lib/auth/password";
import { clientIpFromHeaders } from "@/lib/security/guard";

/** Progress of a job. The random token is the credential: a restore ends every session. */
export async function GET(request: Request) {
  const state = jobState(new URL(request.url).searchParams.get("job") ?? "");
  return state ? json(state) : json({ error: "notFound" }, 404);
}

export async function POST(request: Request) {
  const denied = await requireAdminRequest(request, true);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { action?: string; name?: string; password?: string };
  const password = typeof body.password === "string" && body.password ? body.password : undefined;
  try {
    if (body.action === "create") {
      if (password && password.length < PASSWORD_MIN) return json({ error: "passwordTooShort" }, 422);
      return json({ job: startJob("create", async (onProgress) => ({ name: await createBackup("sauvegarde", { password, onProgress }) })) });
    }
    if (body.action === "restore") {
      const name = String(body.name ?? "");
      backupPath(name);
      const adminIp = clientIpFromHeaders(request.headers);
      return json({
        job: startJob("restore", async (onProgress) => ({ name, result: await restoreBackup(name, { password, adminIp, onProgress }) })),
      });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
