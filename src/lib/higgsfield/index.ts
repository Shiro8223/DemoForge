import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "@/lib/config";

/**
 * Higgsfield MCP integration.
 *
 * We deliberately do not hard-code tool names or argument shapes: the hosted server's
 * catalogue changes over time and differs between deployments. Instead we list the
 * server's tools at runtime, pick the video-generation and job-status tools by name
 * (overridable with HIGGSFIELD_VIDEO_TOOL / HIGGSFIELD_STATUS_TOOL), and fill their
 * arguments from each tool's published JSON input schema.
 */

// ---------------------------------------------------------------------------
// Credential storage (server-side only; never sent to the browser)
// ---------------------------------------------------------------------------

const secretFile = () => path.join(config.dataRoot, "secrets", "higgsfield.json");

export interface HiggsfieldCredentials {
  token: string;
  url: string;
  source: "settings" | "env";
}

export async function getCredentials(): Promise<HiggsfieldCredentials | null> {
  try {
    const j = JSON.parse(await fs.readFile(secretFile(), "utf8")) as { token?: string; url?: string };
    if (j.token) return { token: j.token, url: j.url || config.higgsfield.url, source: "settings" };
  } catch {
    /* fall through to env */
  }
  if (config.higgsfield.apiKey) return { token: config.higgsfield.apiKey, url: config.higgsfield.url, source: "env" };
  return null;
}

export async function saveCredentials(token: string, url?: string) {
  await fs.mkdir(path.dirname(secretFile()), { recursive: true, mode: 0o700 });
  await fs.writeFile(secretFile(), JSON.stringify({ token, url: url || undefined }), { mode: 0o600 });
}

export async function clearCredentials() {
  await fs.rm(secretFile(), { force: true });
}

export const maskToken = (t: string) => (t.length <= 8 ? "••••" : `${t.slice(0, 4)}••••${t.slice(-4)}`);

// ---------------------------------------------------------------------------
// MCP plumbing
// ---------------------------------------------------------------------------

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
  description?: string;
};

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

export async function connect(creds: HiggsfieldCredentials): Promise<Client> {
  const client = new Client({ name: "demoforge", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(creds.url), {
    requestInit: { headers: { Authorization: `Bearer ${creds.token}` } },
  });
  await client.connect(transport);
  return client;
}

export async function listTools(client: Client): Promise<ToolInfo[]> {
  const out: ToolInfo[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    out.push(...page.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as JsonSchema })));
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

export function pickTools(tools: ToolInfo[]) {
  const byName = (n: string) => tools.find((t) => t.name === n);
  const videoCandidates = tools
    .filter((t) => /video/i.test(t.name) && !/status|cancel|list|get_|balance/i.test(t.name))
    .sort((a, b) => score(b) - score(a));
  function score(t: ToolInfo) {
    let s = 0;
    if (/generate|create/i.test(t.name)) s += 3;
    if (/text/i.test(t.name)) s += 2; // our generated scenes are text-to-video
    if (/image|img|from_image|i2v/i.test(t.name)) s -= 1;
    if (/batch/i.test(t.name)) s -= 3;
    const req = t.inputSchema.required ?? [];
    if (req.some((r) => /image/i.test(r))) s -= 4;
    return s;
  }
  const video = (config.higgsfield.videoTool && byName(config.higgsfield.videoTool)) || videoCandidates[0] || null;
  const status =
    (config.higgsfield.statusTool && byName(config.higgsfield.statusTool)) ||
    tools.find((t) => /(get_)?(job|request|generation|task)_?(status|result)?$|status|get_job|get_generation/i.test(t.name) && t !== video && !/cancel|list|balance/i.test(t.name)) ||
    null;
  return { video, status };
}

function closest(values: unknown[], target: number) {
  const nums = values.map(Number).filter((n) => !Number.isNaN(n));
  if (!nums.length) return values[0];
  const best = nums.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
  return typeof values[0] === "string" ? String(best) : best;
}

/** Fills a tool's arguments from its JSON schema. Throws if a required field can't be satisfied. */
export function buildArgs(tool: ToolInfo, want: { prompt: string; duration: number; aspectRatio: string }) {
  const props = tool.inputSchema.properties ?? {};
  const required = new Set(tool.inputSchema.required ?? []);
  const args: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(props)) {
    const k = key.toLowerCase();
    if (/^(prompt|text|text_prompt|description|input)$/.test(k) || (k.includes("prompt") && !k.includes("negative"))) {
      args[key] = want.prompt;
    } else if (/aspect|^ratio$|_ratio$/.test(k)) {
      if (!schema.enum || schema.enum.includes(want.aspectRatio)) args[key] = want.aspectRatio;
      else if (required.has(key)) args[key] = schema.enum.find((v) => String(v).startsWith("9")) ?? schema.enum[0];
    } else if (/duration|seconds|length/.test(k)) {
      if (schema.enum) args[key] = closest(schema.enum, want.duration);
      else {
        let d = Math.ceil(want.duration);
        if (schema.minimum != null) d = Math.max(d, schema.minimum);
        if (schema.maximum != null) d = Math.min(d, schema.maximum);
        args[key] = (Array.isArray(schema.type) ? schema.type : [schema.type]).includes("string") ? String(d) : d;
      }
    } else if (required.has(key)) {
      if (schema.default !== undefined) args[key] = schema.default;
      else if (schema.enum?.length) args[key] = schema.enum[0];
      else throw new Error(`Higgsfield tool "${tool.name}" requires "${key}", which DemoForge doesn't know how to fill.`);
    }
  }
  if (!Object.values(args).includes(want.prompt))
    throw new Error(`Higgsfield tool "${tool.name}" has no prompt parameter.`);
  return args;
}

type ToolResult = { content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean };

/** Flattens a tool result into plain JSON values we can search. */
function resultValues(r: ToolResult): unknown[] {
  const out: unknown[] = [];
  if (r.structuredContent) out.push(r.structuredContent);
  for (const c of r.content ?? []) {
    if (c.type === "text" && c.text) {
      try {
        out.push(JSON.parse(c.text));
      } catch {
        out.push(c.text);
      }
    } else out.push(c);
  }
  return out;
}

function walk(v: unknown, visit: (key: string, val: unknown) => void, key = "") {
  if (Array.isArray(v)) v.forEach((x) => walk(x, visit, key));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, visit, k);
  else visit(key, v);
}

export function extractVideoUrl(r: ToolResult): string | null {
  let found: string | null = null;
  for (const v of resultValues(r))
    walk(v, (_k, val) => {
      if (found || typeof val !== "string") return;
      const m = val.match(/https?:\/\/[^\s"'<>)]+?\.(?:mp4|mov|webm)(?:\?[^\s"'<>)]*)?/i);
      if (m) found = m[0];
    });
  return found;
}

export function extractJobId(r: ToolResult): string | null {
  let found: string | null = null;
  for (const v of resultValues(r)) {
    walk(v, (k, val) => {
      if (!found && (typeof val === "string" || typeof val === "number") && /^(job_?id|request_?id|generation_?id|task_?id|id)$/i.test(k))
        found = String(val);
    });
    if (!found && typeof v === "string") {
      const m = v.match(/\b(?:job|request|generation|task)[ _-]?id\W+([A-Za-z0-9-]{6,})/i);
      if (m) found = m[1];
    }
  }
  return found;
}

function extractState(r: ToolResult): "failed" | "done" | "pending" {
  let state: "failed" | "done" | "pending" = "pending";
  for (const v of resultValues(r))
    walk(v, (k, val) => {
      if (typeof val !== "string" || !/^(status|state)$/i.test(k)) return;
      if (/fail|error|cancel|nsfw|reject/i.test(val)) state = "failed";
      else if (/complete|success|succeed|done|finished|ready/i.test(val) && state !== "failed") state = "done";
    });
  return state;
}

const textOf = (r: ToolResult) => (r.content ?? []).map((c) => c.text ?? "").join(" ").slice(0, 400);

export async function generateClip(opts: {
  client: Client;
  tools: ToolInfo[];
  prompt: string;
  duration: number;
  outFile: string;
  onProgress?: (msg: string) => void;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<{ tool: string; url: string }> {
  const { client, tools, prompt, duration, outFile, onProgress } = opts;
  const { video, status } = pickTools(tools);
  if (!video) throw new Error(`No video-generation tool found on the Higgsfield MCP server (tools: ${tools.map((t) => t.name).join(", ") || "none"}).`);
  const args = buildArgs(video, { prompt, duration, aspectRatio: "9:16" });

  onProgress?.(`calling ${video.name}`);
  const first = (await client.callTool({ name: video.name, arguments: args }, undefined, { timeout: 10 * 60_000 })) as ToolResult;
  if (first.isError) throw new Error(`Higgsfield ${video.name} failed: ${textOf(first)}`);

  let url = extractVideoUrl(first);
  if (!url) {
    const jobId = extractJobId(first);
    if (!jobId) throw new Error(`Higgsfield returned neither a video URL nor a job id: ${textOf(first)}`);
    if (!status) throw new Error(`Higgsfield job ${jobId} started but no status tool is available to poll it.`);
    const idKey =
      Object.keys(status.inputSchema.properties ?? {}).find((k) => /id$/i.test(k)) ?? status.inputSchema.required?.[0] ?? "id";
    const deadline = Date.now() + (opts.timeoutMs ?? 12 * 60_000);
    while (!url) {
      if (Date.now() > deadline) throw new Error(`Higgsfield job ${jobId} did not finish in time.`);
      await new Promise((r) => setTimeout(r, opts.pollIntervalMs ?? 8000));
      const s = (await client.callTool({ name: status.name, arguments: { [idKey]: jobId } })) as ToolResult;
      if (s.isError) throw new Error(`Higgsfield ${status.name} failed: ${textOf(s)}`);
      const state = extractState(s);
      if (state === "failed") throw new Error(`Higgsfield job ${jobId} failed: ${textOf(s)}`);
      url = extractVideoUrl(s);
      onProgress?.(`job ${jobId}: ${state}`);
    }
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!res.ok) throw new Error(`Downloading Higgsfield clip failed (${res.status}).`);
  await fs.writeFile(outFile, Buffer.from(await res.arrayBuffer()));
  return { tool: video.name, url };
}

/** Used by the settings page "Test connection" button. */
export async function testConnection(creds: HiggsfieldCredentials) {
  const client = await connect(creds);
  try {
    const tools = await listTools(client);
    const picked = pickTools(tools);
    return { tools: tools.map((t) => t.name), videoTool: picked.video?.name ?? null, statusTool: picked.status?.name ?? null };
  } finally {
    await client.close().catch(() => {});
  }
}
