import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { cloneRepository, fetchRepoMeta, parseGitHubUrl, type RepoMeta } from "@/lib/github";
import { analyseHeuristically, type HeuristicResult } from "@/lib/agent/heuristics";
import { geminiAvailable, enrichAnalysis } from "@/lib/agent/gemini";
import { installDependencies, startApp, type RunningApp } from "@/lib/sandbox";
import { captureScreenshots, discoverFeatureRoutes } from "@/lib/browser";
import { FILTER_LOOK, templateStoryboard, templateSummary, writeStory } from "@/lib/storyboard";
import * as higgsfield from "@/lib/higgsfield";
import * as higgsfieldApi from "@/lib/higgsfield/api";
import { assembleVideo, assertFfmpeg, frameFor, probeHasVideo } from "@/lib/video";
import { elevenLabsConfigured, synthesizeSpeech } from "@/lib/tts/elevenlabs";
import { jobDir, jobSettings, JobTracker } from "@/lib/storage/jobs";
import { VOICES, type MotionStyle } from "@/lib/validation/schemas";
import type { GeneratedScene, Job, Scene, Storyboard, VoiceoverClip } from "@/types";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n").slice(0, 6).join("\n").slice(0, 900);

export interface RunOptions {
  /** Test hook: copy this local directory instead of cloning from GitHub. */
  localRepoDir?: string;
}

export async function runJob(job: Job, opts: RunOptions = {}): Promise<void> {
  const t = new JobTracker(job);
  job.status = "running";
  job.error = undefined;
  await t.save();
  try {
    if (job.mode === "reassemble") await reassemble(t);
    else await fullPipeline(t, opts);
    job.status = "completed";
    job.currentStage = undefined;
  } catch (e) {
    job.status = "failed";
    job.error = errMsg(e);
    const running = job.stages.find((s) => s.status === "running");
    if (running) await t.stage(running.id, "failed", job.error);
  }
  await t.save();
}

async function fullPipeline(t: JobTracker, opts: RunOptions) {
  const job = t.job;
  const out = jobDir(job.id);
  const workspace = path.join(config.workspaceRoot, job.id);
  const logs = path.join(out, "logs");
  await fs.mkdir(logs, { recursive: true });
  let app: RunningApp | null = null;

  try {
    // 0. Preflight: no point cloning, running the app or paying for Higgsfield clips if the video can't be assembled.
    await t.stage("clone", "running", "Checking FFmpeg");
    await assertFfmpeg();

    // 1. Clone ---------------------------------------------------------------
    await t.stage("clone", "running");
    const parsed = parseGitHubUrl(job.repoUrl);
    let repoDir: string;
    let meta: RepoMeta | null = null;
    if (opts.localRepoDir) {
      repoDir = path.join(workspace, "repo");
      await fs.cp(opts.localRepoDir, repoDir, { recursive: true });
      await t.stage("clone", "completed", `local fixture ${path.basename(opts.localRepoDir)}`);
    } else {
      [repoDir, meta] = await Promise.all([cloneRepository(parsed, workspace), fetchRepoMeta(parsed.owner, parsed.repo)]);
      await t.stage("clone", "completed", `${parsed.owner}/${parsed.repo} (shallow)`);
    }

    // 2. Analyse -------------------------------------------------------------
    await t.stage("analyze", "running");
    const h = await analyseHeuristically(repoDir, parsed.repo);
    if (meta?.description && !h.analysis.description) h.analysis.description = meta.description;
    let analysis = h.analysis;
    if (geminiAvailable()) {
      try {
        analysis = await enrichAnalysis(repoDir, h);
      } catch (e) {
        await t.notice(`Gemini analysis failed, using static analysis instead: ${errMsg(e)}`);
      }
    } else {
      await t.notice("GEMINI_API_KEY is not set: analysis, summary and storyboard use DemoForge's deterministic templates instead of Gemini.");
    }
    job.outputs.analysis = analysis;
    await fs.writeFile(path.join(out, "project-analysis.json"), JSON.stringify(analysis, null, 2));
    await t.stage("analyze", "completed", `${analysis.framework} · ${analysis.packageManager} · ${analysis.analysedBy === "gemini" ? "Gemini" : "static analysis"}`);

    // 3-6. Install, start, discover, screenshot ---------------------------------
    const shots = await runAndCapture(t, repoDir, workspace, h, analysis, logs, (a) => (app = a));
    job.outputs.screenshots = shots;
    if (app) await (app as RunningApp).stop();
    app = null;

    // 7-8. Summary + storyboard ------------------------------------------------
    await writeStoryStages(t, shots, meta);

    // 9. Higgsfield ----------------------------------------------------------
    await generateScenes(t);

    // 10. Voiceover (ElevenLabs, optional) -------------------------------------
    await voiceoverStage(t);

    // 11. Assemble -----------------------------------------------------------
    await assembleStage(t);
  } finally {
    if (app) await (app as RunningApp).stop().catch(() => {});
    // node_modules etc. can be large; outputs live in the job dir, so drop the workspace.
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

async function runAndCapture(
  t: JobTracker,
  repoDir: string,
  workspace: string,
  h: HeuristicResult,
  analysis: Job["outputs"]["analysis"] & object,
  logs: string,
  setApp: (a: RunningApp) => void,
) {
  const skipRest = async (from: number, reason: string) => {
    const ids = ["install", "start", "discover", "screenshots"] as const;
    for (const id of ids.slice(from)) await t.stage(id, "skipped", reason);
    await t.notice(`No real screenshots were captured (${reason}). The video uses title scenes only.`);
    return [];
  };

  if (analysis.runKind === "unsupported") return skipRest(0, analysis.setupRisks[0] ?? "No runnable web app detected");
  if (analysis.requiredEnv.length)
    await t.notice(`The app references environment variables DemoForge can't supply: ${analysis.requiredEnv.slice(0, 8).join(", ")}${analysis.requiredEnv.length > 8 ? "…" : ""}. Pages that depend on them may not render.`);

  const home = path.join(workspace, "home");
  await t.stage("install", "running", analysis.installCommand || undefined);
  const inst = await installDependencies(repoDir, home, analysis, path.join(logs, "install.log"));
  if (!inst.ok) {
    await t.stage("install", "failed", inst.detail);
    return skipRest(1, "dependency install failed");
  }
  await t.stage("install", "completed", inst.detail);

  await t.stage("start", "running", analysis.startScript ? `${analysis.packageManager} run ${analysis.startScript}` : "static server");
  let app: RunningApp;
  try {
    app = await startApp({ repoDir, home, analysis, scripts: h.scripts, jobId: t.job.id, logFile: path.join(logs, "start.log") });
    setApp(app);
  } catch (e) {
    await t.stage("start", "failed", errMsg(e));
    return skipRest(2, "the app did not start");
  }
  t.job.outputs.appUrl = app.url;
  await t.stage("start", "completed", `Responding at ${app.url}`);

  await t.stage("discover", "running");
  let routes = analysis.routes;
  try {
    routes = await discoverFeatureRoutes(app.url, analysis.routes);
    analysis.routes = routes.slice(0, 12);
    await t.stage("discover", "completed", `${routes.length} candidate route(s): ${routes.slice(0, 5).join(", ")}`);
  } catch (e) {
    await t.stage("discover", "failed", `Homepage didn't load in the browser: ${errMsg(e)}`);
  }

  await t.stage("screenshots", "running");
  const { shots, failures } = await captureScreenshots({
    baseUrl: app.url,
    routes,
    outDir: path.join(jobDir(t.job.id), "screenshots"),
    relPrefix: "screenshots",
  });
  if (failures.length) await t.notice(`Some routes were skipped: ${failures.slice(0, 4).join("; ")}`);
  if (!shots.length) {
    await t.stage("screenshots", "failed", "No page rendered usable content");
    await t.notice("No real screenshots were captured. The video uses title scenes only.");
  } else await t.stage("screenshots", "completed", `${shots.length} page(s): ${shots.map((s) => s.route).join(", ")}`);
  return shots;
}

async function writeStoryStages(t: JobTracker, shots: NonNullable<Job["outputs"]["screenshots"]>, meta: RepoMeta | null) {
  const job = t.job;
  const out = jobDir(job.id);
  const input = { analysis: job.outputs.analysis!, screenshots: shots, repoUrl: job.repoUrl, stars: meta?.stars, topics: meta?.topics, settings: jobSettings(job) };
  await t.stage("summary", "running", geminiAvailable() ? "Gemini is writing" : "Template");
  let story;
  try {
    story = await writeStory(input);
  } catch (e) {
    await t.notice(`Gemini storyboard failed, used template instead: ${errMsg(e)}`);
    const storyboard = templateStoryboard(input);
    story = { storyboard, summary: templateSummary(input, storyboard), authoredBy: "template" as const };
  }
  await fs.writeFile(path.join(out, "summary.md"), story.summary);
  job.outputs.summary = "summary.md";
  job.outputs.authoredBy = story.authoredBy;
  await t.stage("summary", "completed", story.authoredBy === "gemini" ? "Written by Gemini" : "Template");

  await t.stage("storyboard", "running");
  await fs.writeFile(path.join(out, "storyboard.json"), JSON.stringify(story.storyboard, null, 2));
  job.outputs.storyboard = story.storyboard;
  await t.stage("storyboard", "completed", `${story.storyboard.scenes.length} scenes · ${story.storyboard.duration}s · validated`);
}

/** The screenshot scene this one should morph into (the next scene, when it is also a real screenshot). */
function blendTarget(sb: Storyboard, scene: Scene, job: Job): Scene | null {
  if (jobSettings(job).blendShots === false || scene.visualType !== "screenshot" || !scene.screenshot) return null;
  const next = sb.scenes[sb.scenes.findIndex((s) => s.id === scene.id) + 1];
  return next?.visualType === "screenshot" && next.screenshot && next.screenshot !== scene.screenshot ? next : null;
}

/** Camera style per Motion setting, for Higgsfield (the local renderer mirrors it in video/index.ts). */
const MOTION_DIRECTION: Record<MotionStyle, string> = {
  glide: "Slow, smooth, steady camera glide with a gentle push-in and soft parallax",
  zoom: "Confident, punchy camera zooms into the key part of the screen, eased in and out, then hold",
  dramatic: "Slow dramatic push-in with shallow depth of field and a soft light sweep, like a film trailer",
};

/** Said last, so it outweighs anything above: the usual source of random, unrelated footage. */
const SCREENSHOT_GUARD =
  "Camera motion only over this still interface: nothing new appears, nothing morphs or melts, no people, hands, objects, " +
  "particles or abstract effects. Keep every UI element, word and layout exactly as captured, crisp and readable";

/** Higgsfield prompt for one scene: its camera direction, the motion style, the user's instructions, grade and guards. */
function clipPrompt(sb: Storyboard, scene: Scene, job: Job, blending = false) {
  const settings = jobSettings(job);
  const look = FILTER_LOOK[settings.filter];
  const framing = sb.aspectRatio === "16:9" ? "Widescreen 16:9" : "Vertical 9:16";
  const motion = MOTION_DIRECTION[settings.motion ?? "glide"];
  const direction = settings.instructions ? `Creative direction (mood and pacing only): ${settings.instructions.slice(0, 500)}` : "";
  const parts =
    scene.visualType === "screenshot"
      ? [
          `Animate this exact screenshot of the real app. ${scene.videoPrompt}`,
          motion,
          ...(blending ? ["As one continuous camera move, flow seamlessly into the next screen of the same app, landing exactly on the final frame"] : []),
          ...(direction ? [direction] : []),
          ...(look ? [`Look: ${look}`] : []),
          SCREENSHOT_GUARD,
        ]
      : [scene.videoPrompt, motion, `Style: ${sb.visualStyle}`, ...(direction ? [direction] : []), ...(look ? [`Look: ${look}`] : []), `${framing}, no on-screen text`];
  return parts.map((p) => p.trim().replace(/[.\s]+$/, "")).join(". ") + ".";
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

async function generateScenes(t: JobTracker, onlySceneId?: string) {
  const job = t.job;
  const sb = job.outputs.storyboard!;
  const creds = await higgsfield.getCredentials();
  const api = higgsfieldApi.apiConfigured();
  // The developer API animates every scene: screenshots via image-to-video, the rest via text-to-video.
  // The MCP fallback can only do text-to-video, so it keeps to generated scenes.
  const animatable = (s: Scene) => s.visualType === "generated" || (api && s.visualType === "screenshot" && !!s.screenshot);
  const targets = sb.scenes
    .filter((s) => animatable(s) && (!onlySceneId || s.id === onlySceneId))
    .slice(0, onlySceneId ? 1 : Math.max(0, config.higgsfield.maxScenes));

  if (api && targets.length) {
    const skipped = sb.scenes.filter(animatable).length - targets.length;
    await t.stage("generate", "running", `Higgsfield API: animating ${targets.length} scene(s), ${config.higgsfield.concurrency} at a time`);
    if (skipped > 0)
      await t.notice(`HIGGSFIELD_MAX_SCENES (${config.higgsfield.maxScenes}) left ${skipped} scene(s) unanimated. Raise it in .env to animate every scene.`);
    const clipsDir = path.join(jobDir(job.id), "scenes");
    await fs.mkdir(clipsDir, { recursive: true });
    const existing = (job.outputs.generatedScenes ?? []).filter((g) => !targets.some((s) => s.id === g.sceneId));
    const made: GeneratedScene[] = [];
    const errors: string[] = [];
    const progress = new Map<string, string>();
    const report = () => void t.stage("generate", "running", [...progress].map(([id, m]) => `${id}: ${m}`).join(" · "));
    await pool(targets, config.higgsfield.concurrency, async (s) => {
      const rel = `scenes/${s.id}.mp4`;
      const into = blendTarget(sb, s, job);
      const prompt = clipPrompt(sb, s, job, !!into);
      try {
        const r = await higgsfieldApi.generateClipViaApi({
          prompt,
          duration: s.duration,
          aspectRatio: sb.aspectRatio,
          imageFile: s.visualType === "screenshot" && s.screenshot ? path.join(jobDir(job.id), s.screenshot) : undefined,
          endImageFile: into?.screenshot ? path.join(jobDir(job.id), into.screenshot) : undefined,
          outFile: path.join(jobDir(job.id), rel),
          onProgress: (m) => {
            progress.set(s.id, m);
            report();
          },
        });
        if (!(await probeHasVideo(path.join(jobDir(job.id), rel)))) throw new Error("Downloaded file is not a valid video");
        made.push({ sceneId: s.id, file: rel, source: "higgsfield", tool: r.tool, prompt, ...(r.blended && into ? { blendsInto: into.id } : {}) });
        progress.set(s.id, "done");
      } catch (e) {
        errors.push(`${s.id}: ${errMsg(e)}`);
        progress.set(s.id, "failed");
      }
      report();
    });
    job.outputs.generatedScenes = [...existing, ...made].sort((a, b) => a.sceneId.localeCompare(b.sceneId, undefined, { numeric: true }));
    await t.save();
    if (errors.length) await t.notice(`Higgsfield generation problems. Affected scenes use local animation instead: ${errors.join(" | ")}`);
    if (!made.length) await t.stage("generate", "failed", errors[0] ?? "No scenes generated");
    else await t.stage("generate", "completed", `${made.length}/${targets.length} scene(s) animated by Higgsfield`);
    return;
  }

  if (!creds) {
    await t.stage("generate", "skipped", "Higgsfield is not configured. Generated scenes were rendered locally as motion title cards.");
    await t.notice("Higgsfield is not configured (Settings): cinematic scenes are local motion-graphics cards, not AI-generated footage.");
    return;
  }
  if (!targets.length) {
    await t.stage("generate", "skipped", "Storyboard has no generated scenes");
    return;
  }

  await t.stage("generate", "running", `Connecting to ${new URL(creds.url).host}`);
  const clipsDir = path.join(jobDir(job.id), "scenes");
  await fs.mkdir(clipsDir, { recursive: true });
  const existing = (job.outputs.generatedScenes ?? []).filter((g) => !targets.some((s) => s.id === g.sceneId));
  const made: GeneratedScene[] = [];
  const errors: string[] = [];
  let client;
  try {
    client = await higgsfield.connect(creds);
    const tools = await higgsfield.listTools(client);
    for (const s of targets) {
      const rel = `scenes/${s.id}.mp4`;
      try {
        const r = await higgsfield.generateClip({
          client,
          tools,
          prompt: clipPrompt(sb, s, job),
          duration: s.duration,
          aspectRatio: sb.aspectRatio,
          outFile: path.join(jobDir(job.id), rel),
          onProgress: (m) => void t.stage("generate", "running", `${s.id}: ${m}`),
        });
        if (!(await probeHasVideo(path.join(jobDir(job.id), rel)))) throw new Error("Downloaded file is not a valid video");
        made.push({ sceneId: s.id, file: rel, source: "higgsfield", tool: r.tool, prompt: s.videoPrompt });
      } catch (e) {
        errors.push(`${s.id}: ${errMsg(e)}`);
      }
    }
  } catch (e) {
    errors.push(`connection: ${errMsg(e)}`);
  } finally {
    await client?.close().catch(() => {});
  }
  job.outputs.generatedScenes = [...existing, ...made];
  await t.save();
  if (errors.length) await t.notice(`Higgsfield generation problems. Affected scenes fall back to local title cards: ${errors.join(" | ")}`);
  if (!made.length) await t.stage("generate", "failed", errors[0] ?? "No scenes generated");
  else await t.stage("generate", "completed", `${made.length} Higgsfield scene(s) via ${made[0].tool}`);
}

/** Records one ElevenLabs line per scene. Reuses earlier recordings whose text hasn't changed (scene edits). */
async function voiceoverStage(t: JobTracker) {
  const job = t.job;
  const sb = job.outputs.storyboard!;
  if (!jobSettings(job).voiceover) {
    await t.stage("voiceover", "skipped", "Voiceover was off for this video");
    return;
  }
  if (!elevenLabsConfigured()) {
    await t.stage("voiceover", "skipped", "ELEVENLABS_API_KEY is not set");
    await t.notice("Voiceover was requested but ElevenLabs is not configured, so the video has music only.");
    return;
  }
  const { voiceId = "", voiceTone = "friendly" } = jobSettings(job);
  const voiceName = VOICES.find((v) => v.id === voiceId)?.name ?? "custom voice";
  const voice = `${voiceId}|${voiceTone}`;
  await t.stage("voiceover", "running", `ElevenLabs · ${voiceName} · ${voiceTone}`);
  const out = jobDir(job.id);
  await fs.mkdir(path.join(out, "voiceover"), { recursive: true });
  const previous = new Map((job.outputs.voiceover ?? []).map((v) => [v.sceneId, v]));
  const clips: VoiceoverClip[] = [];
  const errors: string[] = [];
  const lines = sb.scenes.map((s) => s.narration?.trim() ?? "");
  for (const [i, s] of sb.scenes.entries()) {
    const text = lines[i];
    if (!text) continue;
    const prev = previous.get(s.id);
    const exists = prev && (await fs.access(path.join(out, prev.file)).then(() => true, () => false));
    if (prev && prev.text === text && (prev.voice ?? "|friendly") === voice && exists) {
      clips.push(prev);
      continue;
    }
    const rel = `voiceover/${s.id}.mp3`;
    try {
      await t.stage("voiceover", "running", `${s.id}: recording`);
      // The neighbouring lines let ElevenLabs keep one continuous delivery across the separate recordings.
      await synthesizeSpeech(text, path.join(out, rel), {
        voiceId: voiceId || undefined,
        tone: voiceTone,
        previousText: lines.slice(0, i).filter(Boolean).join(" ") || undefined,
        nextText: lines.slice(i + 1).filter(Boolean).join(" ") || undefined,
      });
      clips.push({ sceneId: s.id, file: rel, text, voice });
    } catch (e) {
      errors.push(`${s.id}: ${errMsg(e)}`);
      // The same failure (bad key, no credits) would repeat for every scene.
      if (/API key|credits|characters/i.test(errMsg(e))) break;
    }
  }
  job.outputs.voiceover = clips;
  await t.save();
  if (errors.length) await t.notice(`Voiceover problems. Affected scenes have music only: ${errors.join(" | ")}`);
  if (!clips.length) await t.stage("voiceover", "failed", errors[0] ?? "No narration lines to record");
  else await t.stage("voiceover", "completed", `${clips.length} line(s) via ElevenLabs · ${voiceName} · ${voiceTone}`);
}

async function assembleStage(t: JobTracker) {
  const job = t.job;
  const out = jobDir(job.id);
  await t.stage("assemble", "running");
  const settings = jobSettings(job);
  const generated = job.outputs.generatedScenes ?? [];
  const clips = new Map(generated.map((g) => [g.sceneId, path.join(out, g.file)]));
  const scenes = job.outputs.storyboard!.scenes;
  // Only while the storyboard still has that screenshot next (scene edits can reorder or swap shots).
  const blends = new Set(
    generated
      .filter((g) => {
        const i = scenes.findIndex((s) => s.id === g.sceneId);
        return g.blendsInto && scenes[i + 1]?.id === g.blendsInto;
      })
      .map((g) => g.sceneId),
  );
  const { duration } = await assembleVideo({
    storyboard: job.outputs.storyboard!,
    resolveShot: (rel) => path.join(out, rel),
    clipFor: (id) => clips.get(id) ?? null,
    blendsIntoNext: (id) => blends.has(id),
    workDir: out,
    output: path.join(out, "final-demo.mp4"),
    poster: path.join(out, "poster.jpg"),
    repoLabel: `github.com/${job.owner}/${job.repo}`,
    filter: settings.filter,
    motion: settings.motion,
    voiceover: settings.voiceover ? (job.outputs.voiceover ?? []).map((v) => ({ sceneId: v.sceneId, file: path.join(out, v.file) })) : [],
    onProgress: (m) => t.stage("assemble", "running", m),
  });
  await fs.rm(path.join(out, "render"), { recursive: true, force: true });
  job.outputs.video = "final-demo.mp4";
  job.outputs.poster = "poster.jpg";
  const { W, H } = frameFor(job.outputs.storyboard!.aspectRatio);
  const grade = settings.filter !== "none" ? ` · ${settings.filter} grade` : "";
  await t.stage("assemble", "completed", `final-demo.mp4 · ${duration.toFixed(1)}s · ${W}×${H}${grade}`);
}

/** Scene edit / regenerate: optionally re-request one Higgsfield scene, then rebuild the MP4. */
async function reassemble(t: JobTracker) {
  const job = t.job;
  await t.stage("assemble", "running", "Checking FFmpeg");
  await assertFfmpeg();
  await fs.writeFile(path.join(jobDir(job.id), "storyboard.json"), JSON.stringify(job.outputs.storyboard, null, 2));
  if (job.regenerateSceneId) {
    await generateScenes(t, job.regenerateSceneId);
    job.regenerateSceneId = undefined;
  }
  if (jobSettings(job).voiceover) await voiceoverStage(t);
  await assembleStage(t);
  job.mode = "full";
}
