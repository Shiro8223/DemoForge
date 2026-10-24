import fs from "node:fs/promises";
import path from "node:path";
import { customAlphabet } from "nanoid";
import { config } from "@/lib/config";
import { STAGES, type Job, type StageId, type StageState, type StageStatus } from "@/types";

// Lowercase alphanumerics only: safe in paths, URLs and docker container names.
const makeId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);
const ID_RE = /^[0-9a-z]{12}$/;

export const isValidJobId = (id: string) => ID_RE.test(id);

export const jobsDir = () => path.join(config.outputRoot, "jobs");
export const jobDir = (id: string) => {
  if (!isValidJobId(id)) throw new Error("Invalid job id");
  return path.join(jobsDir(), id);
};
const jobFile = (id: string) => path.join(jobDir(id), "job.json");

export function freshStages(): StageState[] {
  return STAGES.map((s) => ({ id: s.id, label: s.label, status: "pending" as StageStatus }));
}

export async function createJob(input: { repoUrl: string; owner: string; repo: string; liveUrl?: string }): Promise<Job> {
  const now = new Date().toISOString();
  const job: Job = {
    id: makeId(),
    projectId: `${input.owner}/${input.repo}`.toLowerCase(),
    repoUrl: input.repoUrl,
    owner: input.owner,
    repo: input.repo,
    ...(input.liveUrl ? { liveUrl: input.liveUrl } : {}),
    status: "pending",
    stages: freshStages(),
    notices: [],
    outputs: {},
    mode: "full",
    createdAt: now,
    updatedAt: now,
  };
  await fs.mkdir(jobDir(job.id), { recursive: true });
  await saveJob(job);
  return job;
}

export async function getJob(id: string): Promise<Job | null> {
  if (!isValidJobId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(jobFile(id), "utf8")) as Job;
  } catch {
    return null;
  }
}

/** Atomic write so the UI never reads a half-written file while polling. */
export async function saveJob(job: Job): Promise<void> {
  job.updatedAt = new Date().toISOString();
  const tmp = `${jobFile(job.id)}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(job, null, 2));
  await fs.rename(tmp, jobFile(job.id));
}

export async function listJobs(limit = 20): Promise<Job[]> {
  let ids: string[] = [];
  try {
    ids = (await fs.readdir(jobsDir())).filter(isValidJobId);
  } catch {
    return [];
  }
  const jobs = (await Promise.all(ids.map(getJob))).filter((j): j is Job => !!j);
  return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export async function nextPendingJob(): Promise<Job | null> {
  const jobs = await listJobs(200);
  return jobs.filter((j) => j.status === "pending").sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0] ?? null;
}

/** Helper used by the worker to move a stage through its lifecycle and persist. */
export class JobTracker {
  constructor(public job: Job) {}

  async stage(id: StageId, status: StageStatus, detail?: string) {
    let s = this.job.stages.find((x) => x.id === id);
    if (!s) {
      // Jobs created before this stage existed: add it in pipeline order.
      s = { id, label: STAGES.find((x) => x.id === id)?.label ?? id, status: "pending" };
      const order = STAGES.map((x) => x.id) as StageId[];
      this.job.stages.push(s);
      this.job.stages.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }
    s.status = status;
    if (detail !== undefined) s.detail = detail;
    const now = new Date().toISOString();
    if (status === "running") {
      s.startedAt = now;
      s.finishedAt = undefined;
      this.job.currentStage = id;
    } else if (status !== "pending") {
      s.finishedAt = now;
    }
    await saveJob(this.job);
  }

  async notice(msg: string) {
    if (!this.job.notices.includes(msg)) this.job.notices.push(msg);
    await saveJob(this.job);
  }

  async save() {
    await saveJob(this.job);
  }
}

/** Resolve a path inside a job's output directory, refusing traversal. */
export function resolveJobFile(id: string, rel: string): string | null {
  const base = jobDir(id);
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

// ---------------------------------------------------------------------------
// Worker heartbeat: lets the UI warn when no worker is running.
// ---------------------------------------------------------------------------

const heartbeatFile = () => path.join(config.outputRoot, "worker.json");

export async function writeHeartbeat(currentJob: string | null) {
  await fs.mkdir(config.outputRoot, { recursive: true });
  await fs.writeFile(heartbeatFile(), JSON.stringify({ at: Date.now(), pid: process.pid, currentJob }));
}

export async function workerAlive(maxAgeMs = 30_000): Promise<boolean> {
  try {
    const { at } = JSON.parse(await fs.readFile(heartbeatFile(), "utf8")) as { at: number };
    return Date.now() - at < maxAgeMs;
  } catch {
    return false;
  }
}
