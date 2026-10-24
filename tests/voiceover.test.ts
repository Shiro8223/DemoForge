/**
 * Voiceover: script cleaning/budgeting, the ElevenLabs client against a local *mock*
 * server (test-only), and FFmpeg mixing of narration under the music.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { execa } from "execa";
import { cleanScript, maxWords, synthesize, templateScript } from "@/lib/voiceover";
import { templateStoryboard } from "@/lib/storyboard";
import { assembleVideo, probeDuration } from "@/lib/video";
import type { ProjectAnalysis } from "@/types";

const analysis: ProjectAnalysis = {
  name: "Launchpad",
  description: "A mission board that splits work into bite-sized tasks. Built for teams.",
  framework: "Node.js",
  languages: ["JavaScript"],
  packageManager: "npm",
  installCommand: "npm install",
  startScript: "start",
  runKind: "script",
  appDir: ".",
  likelyPort: 3000,
  requiredEnv: [],
  routes: ["/", "/board"],
  features: ["Mission board", "Countdown timer"],
  setupRisks: [],
  analysedBy: "heuristic",
};

async function tone(file: string, seconds: number) {
  await execa("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-ac", "1", "-b:a", "64k", file]);
}

test("cleanScript strips markup and fits the word budget", () => {
  const s = cleanScript("**Meet** Launchpad 🚀 [music swells] at https://x.dev. " + "word ".repeat(80), 20);
  assert.ok(!/[*🚀[\]]|https?:/.test(s), s);
  assert.ok(s.split(" ").length <= 20, s);
  assert.match(s, /[.!?]$/);
  assert.equal(maxWords(20), 43); // (20 - 2) s × 2.4 words/s
});

test("templateScript speaks the project and its on-screen text within budget", () => {
  const sb = templateStoryboard({ analysis, screenshots: [], repoUrl: "https://github.com/x/launchpad" });
  const s = templateScript(sb, analysis);
  assert.match(s, /^Launchpad\. A mission board/);
  assert.ok(s.split(" ").length <= maxWords(sb.duration));
});

test("synthesize: posts text to ElevenLabs and saves the audio; clear errors", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "df-vo-"));
  const mp3 = path.join(tmp, "src.mp3");
  await tone(mp3, 2);
  const seen: { url?: string; key?: string; body?: Record<string, unknown> } = {};
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    seen.url = req.url;
    seen.key = req.headers["xi-api-key"] as string;
    seen.body = JSON.parse(raw || "{}");
    if (seen.key !== "test-key") {
      res.writeHead(401);
      return res.end('{"detail":{"status":"invalid_api_key"}}');
    }
    if (String(seen.body?.text).includes("QUOTA")) {
      res.writeHead(401);
      return res.end('{"detail":{"status":"quota_exceeded","message":"This request exceeds your quota"}}');
    }
    res.setHeader("content-type", "audio/mpeg");
    res.end(await fs.readFile(mp3));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const saved = { ...process.env };
  try {
    process.env.ELEVENLABS_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.ELEVENLABS_API_KEY = "test-key";
    delete process.env.ELEVENLABS_VOICE_ID;
    const out = path.join(tmp, "vo.mp3");
    const r = await synthesize("Meet Launchpad.", out);
    assert.equal(seen.url, "/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128");
    assert.deepEqual(seen.body, { text: "Meet Launchpad.", model_id: "eleven_multilingual_v2" });
    assert.equal(r.voiceId, "JBFqnCBsd6RMkjVDRZzb");
    assert.ok((await probeDuration(out)) > 1.5);

    await assert.rejects(synthesize("QUOTA please", out), /out of characters\/credits/);
    process.env.ELEVENLABS_API_KEY = "wrong";
    await assert.rejects(synthesize("hi", out), /rejected the API key/);
    process.env.ELEVENLABS_API_KEY = "";
    await assert.rejects(synthesize("hi", out), /ELEVENLABS_API_KEY is not set/);
  } finally {
    process.env = saved;
    server.close();
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("assembleVideo mixes a too-long voiceover in without changing the video length", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "df-mix-"));
  try {
    const sb = templateStoryboard({ analysis, screenshots: [], repoUrl: "https://github.com/x/launchpad" });
    const voice = path.join(tmp, "vo.mp3");
    await tone(voice, sb.duration + 10); // longer than the video: must be sped up/faded, never lengthen it
    const render = (out: string, voiceover: string | null) =>
      assembleVideo({
        storyboard: sb,
        resolveShot: (rel) => path.join(tmp, rel),
        clipFor: () => null,
        workDir: tmp,
        output: out,
        poster: path.join(tmp, "poster.jpg"),
        repoLabel: "github.com/x/launchpad",
        voiceover,
      });
    const withVoice = await render(path.join(tmp, "with.mp4"), voice);
    const musicOnly = await render(path.join(tmp, "without.mp4"), null);
    assert.ok(Math.abs(withVoice.duration - musicOnly.duration) < 0.3, `${withVoice.duration} vs ${musicOnly.duration}`);
    // The 440 Hz narration tone must be clearly present in the voiced mix and absent without it.
    const level440 = async (f: string) => {
      const r = await execa("ffmpeg", ["-hide_banner", "-i", f, "-af", "bandpass=f=440:width_type=q:w=8,volumedetect", "-f", "null", "-"], { reject: false });
      return Number(r.stderr.match(/mean_volume: (-?[\d.]+) dB/)?.[1] ?? -99);
    };
    const [a, b] = [await level440(path.join(tmp, "with.mp4")), await level440(path.join(tmp, "without.mp4"))];
    assert.ok(a - b > 10, `voice band ${a} dB vs music-only ${b} dB`);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
