import "server-only";
import { randomToken, safeEqual } from "@/lib/crypto";
import { BackupError, type BackupErrorCode } from "./container";
import type { Progress, RestoreResult } from "./service";

// Backups can take minutes: they run in the background and the page polls their state, so a
// reverse proxy timeout cannot interrupt them.

export interface JobState {
  type: "create" | "restore";
  status: "running" | "done" | "error";
  phase: Parameters<Progress>[0] | null;
  done: number;
  total: number;
  error?: BackupErrorCode;
  name?: string;
  result?: RestoreResult;
}

interface Job extends JobState {
  token: string;
}

const store = globalThis as unknown as { __advent_backup_job?: Job };

export function isBusy() {
  return store.__advent_backup_job?.status === "running";
}

/** Starts the only allowed job. The token lets the page read the outcome after a restore ended its session. */
export function startJob(
  type: JobState["type"],
  run: (onProgress: Progress) => Promise<{ name?: string; result?: RestoreResult }>,
): string {
  if (isBusy()) throw new BackupError("busy");
  const job: Job = { type, status: "running", phase: null, done: 0, total: 0, token: randomToken(24) };
  store.__advent_backup_job = job;
  run((phase, done, total) => Object.assign(job, { phase, done, total }))
    .then((outcome) => Object.assign(job, outcome, { status: "done" }))
    .catch((e) => {
      console.error(`[backup] ${type} failed:`, e);
      Object.assign(job, { status: "error", error: e instanceof BackupError ? e.code : "failed" });
    });
  return job.token;
}

export function jobState(token: string): JobState | null {
  const job = store.__advent_backup_job;
  if (!job || !safeEqual(job.token, token)) return null;
  const { token: _token, ...state } = job;
  return state;
}
