import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGitHubUrl } from "@/lib/github";
import { cameraMove, sceneStarts, wrapText } from "@/lib/video";
import { parseReadme } from "@/lib/agent/heuristics";
import { finaliseStoryboard, runtimeOf, templateStoryboard } from "@/lib/storyboard";
import { generationSettingsSchema, maxScenesFor, storyboardSchema, type ProjectAnalysis } from "@/lib/validation/schemas";
import { buildArgs, extractJobId, extractVideoUrl, pickTools, type ToolInfo } from "@/lib/higgsfield";
import { resolveJobFile } from "@/lib/storage/jobs";

test("parseGitHubUrl accepts common forms", () => {
  for (const u of ["https://github.com/a/b", "github.com/a/b.git", "a/b", "https://github.com/a/b/tree/main/src", "http://www.github.com/a/b/"]) {
    const p = parseGitHubUrl(u);
    assert.equal(p.owner, "a");
    assert.equal(p.repo, "b");
    assert.equal(p.cloneUrl, "https://github.com/a/b.git");
  }
});

test("parseGitHubUrl rejects hostile input", () => {
  for (const u of ["https://gitlab.com/a/b", "https://user:pw@github.com/a/b", "https://github.com/a", "https://github.com/../..", "https://github.com/a/-rf", "file:///etc/passwd", "https://github.com.evil.com/a/b"]) {
    assert.throws(() => parseGitHubUrl(u), u);
  }
});

test("resolveJobFile blocks traversal", () => {
  assert.equal(resolveJobFile("abcdefghijkl", "../x.mp4"), null);
  assert.equal(resolveJobFile("abcdefghijkl", "/etc/passwd"), null);
  assert.ok(resolveJobFile("abcdefghijkl", "screenshots/home.png"));
  assert.throws(() => resolveJobFile("../../etc", "x"));
});

test("wrapText wraps and truncates", () => {
  assert.deepEqual(wrapText("Ship your project not your stress", 12), ["Ship your", "project not", "your stress"]);
  const long = wrapText("one two three four five six seven eight nine ten", 8, 2);
  assert.equal(long.length, 2);
  assert.ok(long[1].endsWith("…"));
});

test("parseReadme extracts description and features", () => {
  const r = parseReadme("# App\n\nThis app does a remarkably useful thing for many people.\n\n## Features\n- **Fast** search\n- [Linked](http://x) thing\n\n## Install\n- npm i");
  assert.match(r.description, /remarkably useful/);
  assert.deepEqual(r.features, ["Fast search", "Linked thing"]);
});

const analysis: ProjectAnalysis = {
  name: "Demo", description: "A demo app for testing purposes and more words here.", framework: "Next.js", languages: ["TypeScript"],
  packageManager: "npm", installCommand: "npm ci", startScript: "dev", runKind: "script", appDir: ".", likelyPort: 3000,
  requiredEnv: [], routes: ["/"], features: ["One", "Two"], setupRisks: [], analysedBy: "heuristic",
};
const shots = [
  { route: "/", title: "Home", desktop: "screenshots/home.png", mobile: "screenshots/home-mobile.png" },
  { route: "/a", title: "A", desktop: "screenshots/a.png", mobile: "screenshots/a-mobile.png" },
];

test("template storyboard validates and uses real screenshots", () => {
  const sb = templateStoryboard({ analysis, screenshots: shots, repoUrl: "x" });
  assert.ok(storyboardSchema.safeParse(sb).success);
  assert.ok(sb.duration >= 15 && sb.duration <= 30, `duration ${sb.duration}`);
  // Every scene shows the real app (no invented hook/closing footage), and every capture is used.
  assert.ok(sb.scenes.every((s) => s.visualType === "screenshot" && s.screenshot));
  assert.deepEqual(new Set(sb.scenes.map((s) => s.screenshot)), new Set(shots.map((s) => s.mobile)));
  // The closing bookends on the first screen shown.
  assert.equal(sb.scenes.at(-1)!.screenshot, sb.scenes[1].screenshot);
  assert.equal(new Set(sb.scenes.map((s) => s.id)).size, sb.scenes.length);
});

test("template storyboard without screenshots is all generated", () => {
  const sb = templateStoryboard({ analysis, screenshots: [], repoUrl: "x" });
  assert.ok(sb.scenes.every((s) => s.visualType === "generated"));
});

test("generation settings clamp scene count to what the length allows", () => {
  assert.equal(maxScenesFor(10), 3);
  assert.equal(maxScenesFor(30), 8);
  const s = generationSettingsSchema.parse({ duration: 10, sceneCount: 8 });
  assert.equal(s.sceneCount, 3);
  assert.equal(generationSettingsSchema.safeParse({ duration: 31 }).success, false);
  assert.equal(generationSettingsSchema.safeParse({ aspectRatio: "4:3" }).success, false);
});

test("storyboards honour scene count, target length, aspect ratio and narration", () => {
  for (const [duration, sceneCount] of [[10, 3], [18, 5], [30, 8]] as const) {
    for (const aspectRatio of ["9:16", "16:9"] as const) {
      const settings = generationSettingsSchema.parse({ duration, sceneCount, aspectRatio, voiceover: true });
      const sb = templateStoryboard({ analysis, screenshots: shots, repoUrl: "x", settings });
      assert.ok(storyboardSchema.safeParse(sb).success);
      assert.equal(sb.scenes.length, sceneCount, `${duration}s/${sceneCount}`);
      assert.equal(sb.aspectRatio, aspectRatio);
      assert.ok(Math.abs(runtimeOf(sb.scenes) - duration) <= 0.2, `runtime ${runtimeOf(sb.scenes)} vs ${duration}`);
      const want = shots.map((s) => (aspectRatio === "16:9" ? s.desktop : s.mobile));
      for (const sc of sb.scenes.filter((x) => x.visualType === "screenshot")) assert.ok(want.includes(sc.screenshot!));
      for (const sc of sb.scenes) assert.ok(sc.narration && sc.narration.split(" ").length <= Math.max(3, Math.floor(sc.duration * 2.5)) + 1);
    }
  }
});

test("finaliseStoryboard trims extra scenes but keeps the closing one", () => {
  const sb = templateStoryboard({ analysis, screenshots: shots, repoUrl: "x", settings: generationSettingsSchema.parse({ sceneCount: 6 }) });
  const trimmed = finaliseStoryboard(sb, shots, generationSettingsSchema.parse({ sceneCount: 3 }));
  assert.equal(trimmed.scenes.length, 3);
  assert.equal(trimmed.scenes[2].textOverlay, sb.scenes[sb.scenes.length - 1].textOverlay);
});

test("finaliseStoryboard hits the target length even when one scene would exceed 10s", () => {
  const base = templateStoryboard({ analysis, screenshots: shots, repoUrl: "x", settings: generationSettingsSchema.parse({ sceneCount: 3 }) });
  // A long middle scene (what Gemini returned in the bug report) used to squeeze the video to 24.2s instead of 25s.
  const lopsided = { ...base, scenes: base.scenes.map((s, i) => ({ ...s, duration: i === 1 ? 10 : 2 })) };
  for (const duration of [25, 29, 12]) {
    const sb = finaliseStoryboard(lopsided, shots, generationSettingsSchema.parse({ sceneCount: 3, duration }));
    assert.ok(Math.abs(runtimeOf(sb.scenes) - duration) <= 0.1, `${duration}s -> ${runtimeOf(sb.scenes)}s`);
    assert.ok(sb.scenes.every((s) => s.duration >= 1.5 && s.duration <= 10));
  }
});

test("sceneStarts accounts for transition overlap", () => {
  const starts = sceneStarts([{ duration: 4, transition: "fade" }, { duration: 5, transition: "fade" }, { duration: 3, transition: "cut" }]);
  assert.deepEqual(starts.map((x) => Math.round(x * 100) / 100), [0, 3.5, 8.46]);
});

test("finaliseStoryboard swaps unknown screenshots for captured ones instead of rendering black frames", () => {
  const sb = templateStoryboard({ analysis, screenshots: shots, repoUrl: "x" });
  const fixed = finaliseStoryboard(sb, shots.slice(0, 1));
  assert.ok(fixed.scenes.every((s) => s.visualType === "screenshot" && s.screenshot === shots[0].mobile));
  // With nothing captured at all, the scene is demoted to a generated one rather than a black frame.
  const none = finaliseStoryboard(sb, []);
  assert.equal(none.scenes[2].visualType, "generated");
  assert.equal(none.scenes[2].screenshot, null);
});

test("camera moves open with a zoom in, close with a pull back and vary in between", () => {
  const moves = [0, 1, 2, 3, 4].map((i) => cameraMove(i, 5, "glide", 90));
  assert.match(moves[0].z, /^1\+/);
  assert.match(moves[4].z, /^1\.08-/);
  assert.equal(moves[1].z, "1.080"); // pan holds the zoom and moves x
  assert.notEqual(new Set(moves.map((m) => m.z + m.x)).size, 1);
  assert.ok(cameraMove(0, 5, "zoom", 90).z.includes("0.200"));
});

const tools: ToolInfo[] = [
  { name: "generate_image", inputSchema: { properties: { prompt: { type: "string" } }, required: ["prompt"] } },
  { name: "image_to_video", inputSchema: { properties: { prompt: { type: "string" }, image_url: { type: "string" } }, required: ["prompt", "image_url"] } },
  {
    name: "generate_video",
    inputSchema: {
      properties: {
        prompt: { type: "string" },
        aspect_ratio: { type: "string", enum: ["16:9", "9:16", "1:1"] },
        duration: { type: "integer", enum: [5, 10] },
        model: { type: "string", enum: ["kling", "veo"] },
        negative_prompt: { type: "string" },
      },
      required: ["prompt", "model"],
    },
  },
  { name: "get_job", inputSchema: { properties: { job_id: { type: "string" } }, required: ["job_id"] } },
  { name: "cancel_job", inputSchema: { properties: { job_id: { type: "string" } } } },
];

test("pickTools prefers text-to-video and a status tool", () => {
  const p = pickTools(tools);
  assert.equal(p.video?.name, "generate_video");
  assert.equal(p.status?.name, "get_job");
});

test("buildArgs fills from schema", () => {
  const args = buildArgs(tools[2], { prompt: "p", duration: 4, aspectRatio: "9:16" });
  assert.deepEqual(args, { prompt: "p", aspect_ratio: "9:16", duration: 5, model: "kling" });
  assert.throws(() => buildArgs(tools[1], { prompt: "p", duration: 4, aspectRatio: "9:16" }), /image_url/);
});

test("result parsing finds URLs and job ids", () => {
  assert.equal(extractVideoUrl({ content: [{ type: "text", text: '{"result":{"video":"https://cdn.x/a.mp4?sig=1"}}' }] }), "https://cdn.x/a.mp4?sig=1");
  assert.equal(extractJobId({ content: [{ type: "text", text: '{"job_id":"abc123"}' }] }), "abc123");
  assert.equal(extractJobId({ content: [{ type: "text", text: "Started generation. Job ID: 9f8e7d6c" }] }), "9f8e7d6c");
});
