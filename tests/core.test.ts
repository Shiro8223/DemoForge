import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGitHubUrl } from "@/lib/github";
import { wrapText } from "@/lib/video";
import { parseReadme } from "@/lib/agent/heuristics";
import { finaliseStoryboard, templateStoryboard } from "@/lib/storyboard";
import { storyboardSchema, type ProjectAnalysis } from "@/lib/validation/schemas";
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
  assert.deepEqual(sb.scenes.filter((s) => s.visualType === "screenshot").map((s) => s.screenshot), shots.map((s) => s.mobile));
  assert.equal(new Set(sb.scenes.map((s) => s.id)).size, sb.scenes.length);
});

test("template storyboard without screenshots is all generated", () => {
  const sb = templateStoryboard({ analysis, screenshots: [], repoUrl: "x" });
  assert.ok(sb.scenes.every((s) => s.visualType === "generated"));
});

test("finaliseStoryboard demotes scenes with unknown screenshots instead of rendering black frames", () => {
  const sb = templateStoryboard({ analysis, screenshots: shots, repoUrl: "x" });
  const fixed = finaliseStoryboard(sb, shots.slice(0, 1));
  const s3 = fixed.scenes[2];
  assert.equal(s3.visualType, "generated");
  assert.equal(s3.screenshot, null);
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
