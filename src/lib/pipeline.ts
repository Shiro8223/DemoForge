import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { cloneRepository, fetchRepoMeta, parseGitHubUrl, type RepoMeta } from "@/lib/github";
import { analyseHeuristically, type HeuristicResult } from "@/lib/agent/heuristics";
import { geminiAvailable, enrichAnalysis } from "@/lib/agent/gemini";
import { installDependencies, startApp, type RunningApp } from "@/lib/sandbox";
import { captureScreenshots, discoverFeatureRoutes } from "@/lib/browser";
import { templateStoryboard, templateSummary, writeStory } from "@/lib/storyboard";
import * as higgsfield from "@/lib/higgsfield";
import * as higgsfieldApi from "@/lib/higgsfield/api";
import { assembleVideo, probeHasVideo } from "@/lib/video";
import { jobDir, JobTracker } from "@/lib/storage/jobs";
import type { GeneratedScene, Job } from "@/types";

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

    // 10. Assemble -----------------------------------------------------------
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
  const input = { analysis: job.outputs.analysis!, screenshots: shots, repoUrl: job.repoUrl, stars: meta?.stars, topics: meta?.topics };
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

async function generateScenes(t: JobTracker, onlySceneId?: string) {
  const job = t.job;
  const sb = job.outputs.storyboard!;
  const creds = await higgsfield.getCredentials();
  const targets = sb.scenes
    .filter((s) => s.visualType === "generated" && (!onlySceneId || s.id === onlySceneId))
    .slice(0, onlySceneId ? 1 : Math.max(0, config.higgsfield.maxScenes));

  if (higgsfieldApi.apiConfigured() && targets.length) {
    // Option B: Higgsfield developer API (HF_CREDENTIALS + HIGGSFIELD_MODEL). Preferred over MCP when set.
    await t.stage("generate", "running", `Higgsfield API (${higgsfieldApi.apiHost()})`);
    const clipsDir = path.join(jobDir(job.id), "scenes");
    await fs.mkdir(clipsDir, { recursive: true });
    const existing = (job.outputs.generatedScenes ?? []).filter((g) => !targets.some((s) => s.id === g.sceneId));
    const made: GeneratedScene[] = [];
    const errors: string[] = [];
    for (const s of targets) {
      const rel = `scenes/${s.id}.mp4`;
      try {
        const r = await higgsfieldApi.generateClipViaApi({
          prompt: `${s.videoPrompt}. Style: ${sb.visualStyle}. Vertical 9:16, no on-screen text.`,
          duration: s.duration,
          aspectRatio: "9:16",
          outFile: path.join(jobDir(job.id), rel),
          onProgress: (m) => void t.stage("generate", "running", `${s.id}: ${m}`),
        });
        if (!(await probeHasVideo(path.join(jobDir(job.id), rel)))) throw new Error("Downloaded file is not a valid video");
        made.push({ sceneId: s.id, file: rel, source: "higgsfield", tool: r.tool, prompt: s.videoPrompt });
      } catch (e) {
        errors.push(`${s.id}: ${errMsg(e)}`);
      }
    }
    job.outputs.generatedScenes = [...existing, ...made];
    await t.save();
    if (errors.length) await t.notice(`Higgsfield generation problems — affected scenes fall back to local title cards: ${errors.join(" | ")}`);
    if (!made.length) await t.stage("generate", "failed", errors[0] ?? "No scenes generated");
    else await t.stage("generate", "completed", `${made.length} Higgsfield scene(s) via ${made[0].tool}`);
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
          prompt: `${s.videoPrompt}. Style: ${sb.visualStyle}. Vertical 9:16, no on-screen text.`,
          duration: s.duration,
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
  if (errors.length) await t.notice(`Higgsfield generation problems — affected scenes fall back to local title cards: ${errors.join(" | ")}`);
  if (!made.length) await t.stage("generate", "failed", errors[0] ?? "No scenes generated");
  else await t.stage("generate", "completed", `${made.length} Higgsfield scene(s) via ${made[0].tool}`);
}

async function assembleStage(t: JobTracker) {
  const job = t.job;
  const out = jobDir(job.id);
  await t.stage("assemble", "running");
  const clips = new Map((job.outputs.generatedScenes ?? []).map((g) => [g.sceneId, path.join(out, g.file)]));
  const { duration } = await assembleVideo({
    storyboard: job.outputs.storyboard!,
    resolveShot: (rel) => path.join(out, rel),
    clipFor: (id) => clips.get(id) ?? null,
    workDir: out,
    output: path.join(out, "final-demo.mp4"),
    poster: path.join(out, "poster.jpg"),
    repoLabel: `github.com/${job.owner}/${job.repo}`,
    onProgress: (m) => t.stage("assemble", "running", m),
  });
  await fs.rm(path.join(out, "render"), { recursive: true, force: true });
  job.outputs.video = "final-demo.mp4";
  job.outputs.poster = "poster.jpg";
  await t.stage("assemble", "completed", `final-demo.mp4 · ${duration.toFixed(1)}s · 1080×1920`);
}

/** Scene edit / regenerate: optionally re-request one Higgsfield scene, then rebuild the MP4. */
async function reassemble(t: JobTracker) {
  const job = t.job;
  await fs.writeFile(path.join(jobDir(job.id), "storyboard.json"), JSON.stringify(job.outputs.storyboard, null, 2));
  if (job.regenerateSceneId) {
    await generateScenes(t, job.regenerateSceneId);
    job.regenerateSceneId = undefined;
  }
  await assembleStage(t);
  job.mode = "full";
}
