import path from "node:path";
import "dotenv/config";

// turbopackIgnore: runtime paths only; keeps the build from tracing the whole project.
const root = /*turbopackIgnore: true*/ process.cwd();
const resolve = (p: string | undefined, fallback: string) => path.resolve(/*turbopackIgnore: true*/ root, p || fallback);

/** Server-side configuration. Never import this from client components. */
export const config = {
  workspaceRoot: resolve(process.env.WORKSPACE_ROOT, "workspaces"),
  outputRoot: resolve(process.env.OUTPUT_ROOT, "outputs"),
  dataRoot: resolve(process.env.DATA_ROOT, "data"),
  ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobe: process.env.FFPROBE_PATH || "ffprobe",
  fontsDir: path.join(root, "assets", "fonts"),
  musicPath: process.env.MUSIC_PATH || "",
  sandbox: (process.env.DEMOFORGE_SANDBOX === "docker" ? "docker" : "local") as "docker" | "local",
  dockerImage: process.env.DEMOFORGE_DOCKER_IMAGE || "node:22-bookworm",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  claudeModel: process.env.CLAUDE_MODEL || "claude-opus-5-5",
  higgsfield: {
    url: process.env.HIGGSFIELD_MCP_URL || "https://mcp.higgsfield.ai/mcp",
    apiKey: process.env.HIGGSFIELD_API_KEY || "",
    videoTool: process.env.HIGGSFIELD_VIDEO_TOOL || "",
    statusTool: process.env.HIGGSFIELD_STATUS_TOOL || "",
    maxScenes: Number(process.env.HIGGSFIELD_MAX_SCENES || 2),
  },
  limits: {
    cloneTimeoutMs: 120_000,
    maxRepoSizeMb: 300,
    installTimeoutMs: 6 * 60_000,
    startTimeoutMs: 120_000,
    jobTimeoutMs: 30 * 60_000,
  },
};
