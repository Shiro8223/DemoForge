import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

/**
 * Higgsfield developer API ("Option B"), used instead of the MCP server when HF_CREDENTIALS is set.
 *
 *   Auth:    Authorization: Key KEY_ID:KEY_SECRET      (create the key pair at console.higgsfield.ai)
 *   Submit:  POST {base}/{model}  { prompt, duration, aspect_ratio }  → { request_id, status, ... }
 *   Poll:    GET  {base}/requests/{request_id}/status  until completed | failed | nsfw | canceled
 *   Upload:  POST {base}/files/generate-upload-url { content_type } → { public_url, upload_url, upload_headers },
 *            then PUT the bytes to upload_url (presigned storage; never send our credentials there).
 *
 * Screenshots are animated with an IMAGE-to-video model (HIGGSFIELD_I2V_MODEL, default Kling 3.0 Standard
 * "kling-video/v3.0/std/image-to-video"): the uploaded real UI is the first frame. To blend screenshots, the
 * next screenshot is sent as the last frame under HIGGSFIELD_END_FRAME_PARAM (default "end_image_url"); if the
 * model refuses that field the clip is re-requested with the first frame only.
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
  i2vModel: (process.env.HIGGSFIELD_I2V_MODEL || "kling-video/v3.0/std/image-to-video").replace(/^\/+|\/+$/g, ""),
  endFrameParam: (process.env.HIGGSFIELD_END_FRAME_PARAM || "end_image_url").trim(),
});

const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

/** Uploads a local image to Higgsfield storage and returns its public URL (for image_url). */
export async function uploadImage(file: string): Promise<string> {
  const { base } = env();
  const contentType = IMAGE_TYPES[file.slice(file.lastIndexOf(".")).toLowerCase()];
  if (!contentType) throw new Error(`Unsupported image type for Higgsfield upload: ${file}`);
  const res = await fetch(`${base}/files/generate-upload-url`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ content_type: contentType }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = await readJson(res);
  if (!res.ok || typeof j.upload_url !== "string" || typeof j.public_url !== "string") throw new Error(`Higgsfield upload URL failed: ${explain(res.status, j)}`);
  const put = await fetch(j.upload_url, {
    method: "PUT",
    headers: (j.upload_headers as Record<string, string>) ?? { "Content-Type": contentType },
    body: await fs.readFile(file),
    signal: AbortSignal.timeout(120_000),
  });
  if (!put.ok) throw new Error(`Uploading ${file} to Higgsfield storage failed (${put.status}).`);
  return j.public_url;
}

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
  // Higgsfield answers 403 {"detail":"not_enough_credits"} for a valid key on an empty balance.
  if (status === 402 || /credit/i.test(String(body.detail ?? ""))) return "Higgsfield account is out of credits. Top up at console.higgsfield.ai.";
  if (status === 401 || status === 403) return "Higgsfield rejected the credentials (check HF_CREDENTIALS = KEY_ID:KEY_SECRET).";
  if (status === 404) return "Higgsfield model not found (check HIGGSFIELD_MODEL against the console Models Gallery).";
  if (status === 400 || status === 429) return `Higgsfield refused the request (${status}): ${JSON.stringify(body).slice(0, 300)}. Too many requests at once also returns 400.`;
  return `Higgsfield error ${status}: ${JSON.stringify(body).slice(0, 300)}`;
}

export async function generateClipViaApi(opts: {
  prompt: string;
  duration: number;
  aspectRatio?: string;
  /** Animate this local image (image-to-video, first frame) instead of generating from text. */
  imageFile?: string;
  /** With imageFile: end the clip on this image, so it morphs into the next screenshot. */
  endImageFile?: string;
  outFile: string;
  onProgress?: (msg: string) => void;
  pollIntervalMs?: number;
  timeoutMs?: number;
}): Promise<{ tool: string; url: string; blended: boolean }> {
  const { base, endFrameParam } = env();
  if (!apiConfigured()) throw new Error("Higgsfield API is not configured (HF_CREDENTIALS and HIGGSFIELD_MODEL).");
  const model = opts.imageFile ? env().i2vModel : env().model;

  // Kling needs at least 3-4 s; assembly trims each clip to its scene, so round up generously.
  const duration = Math.min(15, Math.max(4, Math.ceil(opts.duration)));
  let body: Record<string, unknown>;
  if (opts.imageFile) {
    opts.onProgress?.("uploading screenshot");
    // Frame shape comes from the image itself; our soundtrack replaces native audio, so skip it.
    body = { prompt: opts.prompt, image_url: await uploadImage(opts.imageFile), duration, sound: "off" };
    if (opts.endImageFile && endFrameParam) {
      opts.onProgress?.("uploading next screenshot (end frame)");
      body[endFrameParam] = await uploadImage(opts.endImageFile);
    }
  } else {
    body = { prompt: opts.prompt, duration, aspect_ratio: opts.aspectRatio ?? "9:16" };
  }
  let blended = !!endFrameParam && endFrameParam in body;

  // Same key on retry = Higgsfield won't charge twice for the same scene.
  let idempotencyKey = randomUUID();
  let submit: Response;
  let first: Record<string, unknown>;
  for (let attempt = 0; ; attempt++) {
    opts.onProgress?.(`submitting to ${model}${attempt ? ` (retry ${attempt})` : ""}`);
    submit = await fetch(`${base}/${model}`, {
      method: "POST",
      headers: headers({ "Idempotency-Key": idempotencyKey }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    first = await readJson(submit);
    // Too many parallel requests comes back as 429, or 400 mentioning concurrency: back off and retry.
    const busy = submit.status === 429 || (submit.status === 400 && /concurren|too many|in progress|rate/i.test(JSON.stringify(first)));
    // A model without end-frame support rejects the field: drop it and animate the first frame only.
    if (blended && (submit.status === 400 || submit.status === 422) && !busy && JSON.stringify(first).includes(endFrameParam)) {
      delete body[endFrameParam];
      blended = false;
      idempotencyKey = randomUUID(); // a different request, so it must not reuse the refused one's key
      opts.onProgress?.(`${model} has no "${endFrameParam}", animating without blend`);
      continue;
    }
    if (!busy || attempt >= 5) break;
    await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
  }
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
  return { tool: model, url, blended };
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
