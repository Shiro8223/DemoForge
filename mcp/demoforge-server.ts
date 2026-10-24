/**
 * DemoForge MCP server: lets an agent (Claude Code, Claude Desktop, any MCP client) turn a GitHub repo into a
 * promo video, follow the job, tweak scenes and fetch the MP4.
 *
 *   npm run mcp          (stdio; .mcp.json registers it for Claude Code in this project)
 *
 * It is a thin client of the running DemoForge web app (DEMOFORGE_URL, default http://localhost:3000), so every
 * request goes through the same validation, queue limit and repo-access checks as the site, and the generation
 * worker does the work. stdout is the MCP channel: never console.log here.
 */
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FILTERS, LIMITS, MOTIONS, sceneEditSchema, VOICE_TONES, VOICES } from "../src/lib/validation/schemas";
import type { Job } from "../src/types";

const BASE = (process.env.DEMOFORGE_URL || "http://localhost:3000").replace(/\/+$/, "");
const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUTS = path.resolve(ROOT, process.env.OUTPUT_ROOT || "outputs");

class ApiError extends Error {}

async function api<T>(route: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${route}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new ApiError(`DemoForge isn't reachable at ${BASE}. Start it with \`npm run service:start\` (or \`npm run dev:all\`).`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `DemoForge answered ${res.status}`);
  return body as T;
}

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });

/** Wraps a handler so DemoForge errors come back as tool errors the agent can read, not protocol failures. */
const tool =
  <A,>(fn: (args: A) => Promise<ReturnType<typeof text>>) =>
  async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      return { ...text(e instanceof Error ? e.message : String(e)), isError: true };
    }
  };

/** What an agent needs from a job, without the full storyboard JSON. */
function describe(job: Job) {
  const file = (rel?: string) => (rel ? { url: `${BASE}/api/jobs/${job.id}/files/${rel}`, path: path.join(OUTPUTS, "jobs", job.id, rel) } : null);
  const running = job.stages.find((s) => s.status === "running");
  return {
    jobId: job.id,
    repo: job.projectId,
    status: job.status,
    page: `${BASE}/jobs/${job.id}`,
    currentStage: running ? `${running.label}${running.detail ? `: ${running.detail}` : ""}` : undefined,
    progress: `${job.stages.filter((s) => s.status === "completed" || s.status === "skipped").length}/${job.stages.length} stages`,
    stages: job.stages.map((s) => `${s.status.padEnd(9)} ${s.label}${s.detail ? ` (${s.detail.slice(0, 160)})` : ""}`),
    error: job.error,
    notices: job.notices.length ? job.notices : undefined,
    settings: job.settings,
    video: job.status === "completed" ? file(job.outputs.video) : null,
    poster: job.status === "completed" ? file(job.outputs.poster) : null,
    scenes: job.outputs.storyboard?.scenes.map((s) => ({
      id: s.id,
      duration: s.duration,
      shows: s.screenshot ?? s.visualType,
      textOverlay: s.textOverlay,
      narration: s.narration,
      transition: s.transition,
      animatedByHiggsfield: !!job.outputs.generatedScenes?.some((g) => g.sceneId === s.id),
    })),
  };
}

const getJob = (jobId: string) => api<Job>(`/api/jobs/${encodeURIComponent(jobId)}`);
const jobId = z.string().regex(/^[0-9a-z]{12}$/, "A 12-character DemoForge job id").describe("DemoForge job id");

const server = new McpServer(
  { name: "demoforge", version: "0.1.0" },
  {
    instructions:
      "DemoForge turns a GitHub repository into a short promo video built from real screenshots of the running app, " +
      "animated by Higgsfield and narrated by ElevenLabs. Typical flow: generate_demo → wait_for_job (repeat until it " +
      "finishes; a full run takes about 5-15 minutes) → share the video url/path. Use edit_scene to tweak a finished video.",
  },
);

server.registerTool(
  "generate_demo",
  {
    title: "Generate a demo video",
    description:
      "Queue a promo video for a GitHub repository. DemoForge clones and runs the app, screenshots it, writes a storyboard, " +
      "animates it and assembles an MP4. Returns a job id immediately; follow it with wait_for_job. Uses Higgsfield/ElevenLabs credits.",
    inputSchema: {
      repoUrl: z.string().describe("GitHub repository, e.g. https://github.com/owner/repo or owner/repo"),
      aspectRatio: z.enum(["9:16", "16:9"]).optional().describe("9:16 vertical (default) or 16:9 widescreen"),
      duration: z.number().int().min(LIMITS.minDuration).max(LIMITS.maxDuration).optional().describe("Video length in seconds (default 25)"),
      sceneCount: z.number().int().min(LIMITS.minScenes).max(LIMITS.maxScenes).optional().describe("Number of scenes (default 6; capped by length)"),
      motion: z.enum(MOTIONS).optional().describe("Camera style: glide (default), zoom, dramatic"),
      filter: z.enum(FILTERS).optional().describe("Colour grade for the final cut (default none)"),
      blendShots: z.boolean().optional().describe("Each screenshot flows into the next (default true)"),
      instructions: z.string().max(1000).optional().describe("Creative direction for the storyboard, captions, narration and every shot"),
      voiceover: z.boolean().optional().describe("Add an ElevenLabs narrator (default false)"),
      voice: z.enum(VOICES.map((v) => v.name) as [string, ...string[]]).optional().describe(`Narrator: ${VOICES.map((v) => `${v.name} (${v.hint})`).join(", ")}`),
      voiceTone: z.enum(VOICE_TONES).optional().describe("Narration delivery (default friendly)"),
    },
    annotations: { openWorldHint: true },
  },
  tool(async ({ repoUrl, voice, ...rest }) => {
    const settings = Object.fromEntries(Object.entries({ ...rest, voiceId: VOICES.find((v) => v.name === voice)?.id }).filter(([, v]) => v !== undefined));
    const { jobId } = await api<{ jobId: string }>("/api/generate", { method: "POST", body: JSON.stringify({ repoUrl, settings }) });
    return text({ jobId, status: "pending", page: `${BASE}/jobs/${jobId}`, next: "Call wait_for_job with this jobId." });
  }),
);

server.registerTool(
  "wait_for_job",
  {
    title: "Wait for a job",
    description:
      "Wait until a job finishes (or the timeout passes) and return its state: stages, notices, scenes and, when done, the video " +
      "url and local file path. If it is still running when the timeout passes, call it again.",
    inputSchema: { jobId, timeoutSeconds: z.number().int().min(5).max(600).optional().describe("How long to wait (default 240)") },
    annotations: { readOnlyHint: true },
  },
  tool(async ({ jobId, timeoutSeconds }) => {
    const deadline = Date.now() + (timeoutSeconds ?? 240) * 1000;
    let job = await getJob(jobId);
    while ((job.status === "pending" || job.status === "running") && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      job = await getJob(jobId);
    }
    return text(describe(job));
  }),
);

server.registerTool(
  "get_job",
  {
    title: "Get a job",
    description: "Current state of a job: stages, notices, scenes and, when done, the video url and local file path.",
    inputSchema: { jobId },
    annotations: { readOnlyHint: true },
  },
  tool(async ({ jobId }) => text(describe(await getJob(jobId)))),
);

server.registerTool(
  "list_jobs",
  {
    title: "List jobs",
    description: "Most recent DemoForge jobs, newest first.",
    inputSchema: { limit: z.number().int().min(1).max(50).optional().describe("How many (default 10)") },
    annotations: { readOnlyHint: true },
  },
  tool(async ({ limit }) => {
    const rows = await api<{ id: string; projectId: string; status: string; createdAt: string }[]>(`/api/jobs?limit=${limit ?? 10}`);
    return text(rows.map((r) => ({ jobId: r.id, repo: r.projectId, status: r.status, createdAt: r.createdAt, page: `${BASE}/jobs/${r.id}` })));
  }),
);

server.registerTool(
  "edit_scene",
  {
    title: "Edit a scene",
    description:
      "Change one scene of a finished video, then re-render it (only the changed parts are redone). Set regenerate to re-animate " +
      "that scene with Higgsfield (uses credits). Follow with wait_for_job.",
    inputSchema: {
      jobId,
      sceneId: z.string().describe('Scene id from get_job, e.g. "scene-2"'),
      ...sceneEditSchema.shape,
      regenerate: z.boolean().optional().describe("Re-animate this scene with Higgsfield"),
    },
    annotations: { openWorldHint: true },
  },
  tool(async ({ jobId, sceneId, ...edit }) => {
    await api(`/api/jobs/${jobId}/scenes/${encodeURIComponent(sceneId)}`, { method: "PATCH", body: JSON.stringify(edit) });
    return text({ jobId, status: "pending", next: "Re-rendering. Call wait_for_job." });
  }),
);

server.registerTool(
  "regenerate_job",
  {
    title: "Regenerate a video",
    description: "Start a fresh full generation of the same repository with the same settings. Returns the new job id.",
    inputSchema: { jobId },
    annotations: { openWorldHint: true },
  },
  tool(async ({ jobId }) => {
    const next = await api<{ jobId: string }>(`/api/jobs/${jobId}/regenerate`, { method: "POST" });
    return text({ jobId: next.jobId, status: "pending", next: "Call wait_for_job with the new jobId." });
  }),
);

server.registerTool(
  "delete_job",
  {
    title: "Delete a job",
    description: "Permanently delete a job and its video and files. Running jobs can't be deleted.",
    inputSchema: { jobId },
    annotations: { destructiveHint: true },
  },
  tool(async ({ jobId }) => {
    await api(`/api/jobs/${jobId}`, { method: "DELETE" });
    return text(`Deleted ${jobId}.`);
  }),
);

server.registerTool(
  "demoforge_status",
  {
    title: "DemoForge status",
    description: "Whether the worker is running and which integrations (Gemini, Higgsfield, ElevenLabs, FFmpeg) are configured.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  tool(async () => text({ url: BASE, ...(await api<Record<string, unknown>>("/api/health")) })),
);

await server.connect(new StdioServerTransport());
