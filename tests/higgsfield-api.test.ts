/**
 * Tests for the Higgsfield developer-API client against a local *mock* HTTP server.
 * The mock only exists in tests; it mirrors the documented contract:
 * POST {base}/{model} → request_id, GET /requests/{id}/status → status + video.url.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { execa } from "execa";
import { apiConfigured, checkApiCredentials, generateClipViaApi } from "@/lib/higgsfield/api";
import { probeHasVideo } from "@/lib/video";

const AUTH = "Key test-id:test-secret";
const MODEL = "kling-video/v3.0/std/text-to-video";

async function withMockServer(fn: (base: string, seen: { body?: Record<string, unknown>; downloadAuth?: string }) => Promise<void>) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "df-hfapi-"));
  const clip = path.join(tmp, "src.mp4");
  await execa("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=720x1280:d=2:r=24", "-pix_fmt", "yuv420p", clip]);
  const seen: { body?: Record<string, unknown>; downloadAuth?: string } = {};
  let polls = 0;
  const server = http.createServer(async (req, res) => {
    const url = req.url ?? "";
    if (url === "/cdn/out.mp4") {
      seen.downloadAuth = req.headers.authorization;
      res.setHeader("content-type", "video/mp4");
      return res.end(await fs.readFile(clip));
    }
    if (req.headers.authorization !== AUTH) {
      res.writeHead(401);
      return res.end("{}");
    }
    if (req.method === "POST" && url === `/${MODEL}`) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      seen.body = JSON.parse(raw);
      return res.end(JSON.stringify({ status: "queued", request_id: "req-1" }));
    }
    if (url === "/requests/req-1/status") {
      polls++;
      const port = (server.address() as AddressInfo).port;
      return res.end(
        JSON.stringify(
          polls < 2
            ? { status: "in_progress", request_id: "req-1" }
            : { status: "completed", request_id: "req-1", video: { url: `http://127.0.0.1:${port}/cdn/out.mp4` } },
        ),
      );
    }
    res.writeHead(404);
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const saved = { ...process.env };
  try {
    process.env.HF_CREDENTIALS = "test-id:test-secret";
    process.env.HIGGSFIELD_API_BASE = base;
    process.env.HIGGSFIELD_MODEL = MODEL;
    await fn(base, seen);
  } finally {
    process.env = saved;
    server.close();
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

test("higgsfield api: submit → poll → download a valid clip", async () => {
  await withMockServer(async (_base, seen) => {
    assert.equal(apiConfigured(), true);
    const out = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "df-hfout-")), "scene.mp4");
    const r = await generateClipViaApi({ prompt: "cinematic opener", duration: 2.4, outFile: out, pollIntervalMs: 10 });
    assert.equal(r.tool, MODEL);
    assert.equal(await probeHasVideo(out), true);
    // Duration is raised to the models' minimum; aspect ratio defaults to vertical.
    assert.deepEqual(seen.body, { prompt: "cinematic opener", duration: 4, aspect_ratio: "9:16" });
    // The API key must never be sent to the CDN that serves the finished clip.
    assert.equal(seen.downloadAuth, undefined);
  });
});

test("higgsfield api: credential check accepts a good key and rejects a bad one", async () => {
  await withMockServer(async () => {
    assert.equal((await checkApiCredentials()).ok, true);
    process.env.HF_CREDENTIALS = "wrong:key";
    const bad = await checkApiCredentials();
    assert.equal(bad.ok, false);
    assert.equal(bad.status, 401);
  });
});

test("higgsfield api: not configured without a KEY_ID:KEY_SECRET pair", () => {
  const saved = process.env.HF_CREDENTIALS;
  try {
    process.env.HF_CREDENTIALS = "";
    assert.equal(apiConfigured(), false);
    process.env.HF_CREDENTIALS = "just-one-part";
    assert.equal(apiConfigured(), false);
  } finally {
    process.env.HF_CREDENTIALS = saved;
  }
});
