import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { clientIpFromHeaders, ipDecision } from "@/lib/security/guard";
import { BackupError } from "./container";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(e: unknown) {
  if (e instanceof BackupError) {
    const status = e.code === "notFound" ? 404 : e.code === "busy" ? 409 : e.code === "noSpace" ? 507 : 422;
    return json({ error: e.code }, status);
  }
  console.error("[backup]", e);
  return json({ error: "failed" }, 500);
}

/** Admin session, plus a custom header on writes: other sites cannot send it without CORS approval. */
export async function requireAdminRequest(request: Request, write: boolean): Promise<NextResponse | null> {
  if ((await ipDecision(clientIpFromHeaders(request.headers))) === "deny") return json({ error: "forbidden" }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  if (user.role !== "admin") return json({ error: "forbidden" }, 403);
  if (write && request.headers.get("x-advent-request") !== "1") return json({ error: "forbidden" }, 403);
  return null;
}
