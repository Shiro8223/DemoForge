import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

/**
 * Higgsfield developer API ("Option B"), used instead of the MCP server when HF_CREDENTIALS is set.
 *
 *   Auth:    Authorization: Key KEY_ID:KEY_SECRET      (create the key pair at console.higgsfield.ai)
 *   Submit:  POST {base}/{model}  { prompt, duration, aspect_ratio }  → { request_id, status, ... }
 *   Poll:    GET  {base}/requests/{request_id}/status  until completed | failed | nsfw | canceled
 *
 * The model is part of the URL path. Copy the exact path for a TEXT-to-video model from the
 * Models Gallery into HIGGSFIELD_MODEL. Default: Kling 3.0 Standard text-to-video
 * ("kling-video/v3.0/std/text-to-video", 3-15 s). Seedance 2.5 is "bytedance/seedance-2.5/text-to-video" (4-30 s).
 * The credentials never leave the server and are never passed to repo code.
 */

const env = () => ({
  credentials: (process.env.HF_CREDENTIALS || "").trim(),
  base: (process.env.HIGGSFIELD_API_BASE || "https://api.higgsfield.ai").replace(/\/+$/, ""),
  model: (process.env.HIGGSFIELD_MODEL || "kling-video/v3.0/std/text-to-video").replace(/^\/+|\/+$/g, ""),
});

export function apiConfigured(): boolean {
  return /^[^:\s]+:[^:\s]+$/.test(env().credentials);
}

export function apiHost(): string {
  return new URL(env().base).host;
}

function headers(extra: Record<string, string> = {}) {
  return {
    Authorization: `Key ${env().credentials}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra,
  };
}

const TERMINAL_FAIL = /^(failed|nsfw|canceled|cancelled|error)$/i;

/** Finds the first http(s) video URL anywhere in a JSON response. */
function findVideoUrl(v: unknown): string | null {
  if (typeof v === "string") {
    const m = v.match(/^https?:\/\/\S+?\.(?:mp4|mov|webm)(?:\?\S*)?$/i);
    return m ? m[0] : null;
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = findVideoUrl(x);
      if (u) return u;
    }
  } else if (v && typeof v === "object") {
    // Prefer obvious keys first ("video", "url"), then everything else.
    const entries = Object.entries(v).sort(([a], [b]) => Number(/video|url/i.test(b)) - Number(/video|url/i.test(a)));
    for (const [, x] of entries) {
      const u = findVideoUrl(x);
      if (u) return u;
    }
  }
  return null;
}

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

function explain(status: number, body: Record<string, unknown>) {
  if (status === 401 || status === 403) return "Higgsfield rejected the credentials (check HF_CREDENTIALS = KEY_ID:KEY_SECRET).";
  if (status === 402) return "Higgsfield account is out of credits.";
  if (status === 404) return "Higgsfield model not found (check HIGGSFIELD_MODEL against the console Models Gallery).";
  if (status === 400 || status === 429) return `Higgsfield refused the request (${status}): ${JSON.stringify(body).slice(0, 300)}. Too many requests at once also returns 400.`;
  return `Higgsfield error ${status}: ${JSON.stringify(body).slice(0, 300)}`;
}

export async function generateClipViaApi(opts: {
  prompt: string;
  duration: number;
  aspectRatio?: string;
  outFile: string;
  onProgress?: (msg: string) => void;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<{ tool: string; url: string }> {
  const { base, model } = env();
  if (!apiConfigured()) throw new Error("Higgsfield API is not configured (HF_CREDENTIALS and HIGGSFIELD_MODEL).");

  opts.onProgress?.(`submitting to ${model}`);
  const submit = await fetch(`${base}/${model}`, {
    method: "POST",
    // Same key on retry = Higgsfield won't charge twice for the same scene.
    headers: headers({ "Idempotency-Key": randomUUID() }),
    body: JSON.stringify({
      prompt: opts.prompt,
      // Text-to-video models have a minimum length (Kling 3 s, Seedance 4 s); assembly trims to the scene.
      duration: Math.min(15, Math.max(4, Math.round(opts.duration))),
      aspect_ratio: opts.aspectRatio ?? "9:16",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const first = await readJson(submit);
  if (!submit.ok) throw new Error(explain(submit.status, first));

  let url = findVideoUrl(first);
  const requestId = (first.request_id ?? first.id) as string | undefined;
  if (!url && !requestId) throw new Error(`Higgsfield returned no request id: ${JSON.stringify(first).slice(0, 300)}`);

  const deadline = Date.now() + (opts.timeoutMs ?? 12 * 60_000);
  while (!url) {
    if (Date.now() > deadline) throw new Error(`Higgsfield request ${requestId} did not finish in time.`);
    await new Promise((r) => setTimeout(r, opts.pollIntervalMs ?? 8000));
    const res = await fetch(`${base}/requests/${encodeURIComponent(requestId!)}/status`, {
      headers: headers(),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await readJson(res);
    if (!res.ok) throw new Error(explain(res.status, body));
    const status = String(body.status ?? "");
    if (TERMINAL_FAIL.test(status)) throw new Error(`Higgsfield request ${requestId} ended as "${status}".`);
    url = findVideoUrl(body);
    opts.onProgress?.(`request ${requestId}: ${status || "waiting"}`);
  }

  const dl = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!dl.ok) throw new Error(`Downloading Higgsfield clip failed (${dl.status}).`);
  await fs.writeFile(opts.outFile, Buffer.from(await dl.arrayBuffer()));
  return { tool: model, url };
}

/**
 * Free credential check: asks for the status of a request id that doesn't exist.
 * 401/403 → bad key. Anything else (usually 404) → the key was accepted. Costs no credits.
 */
export async function checkApiCredentials(): Promise<{ ok: boolean; status: number; message: string }> {
  const { base } = env();
  const res = await fetch(`${base}/requests/00000000-0000-0000-0000-000000000000/status`, {
    headers: headers(),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 || res.status === 403)
    return { ok: false, status: res.status, message: "Credentials rejected. Check HF_CREDENTIALS = KEY_ID:KEY_SECRET." };
  return { ok: true, status: res.status, message: "Credentials accepted by Higgsfield." };
}
