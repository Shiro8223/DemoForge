import path from "node:path";
import dotenv from "dotenv";

// .env wins; .env.example is a temporary fallback until env vars move to Vercel.
dotenv.config({ path: [".env", ".env.example"], quiet: true });

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
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL || "",
  },
  github: {
    // OAuth App for "Sign in with GitHub" (private repos). Callback: <app URL>/api/auth/github/callback
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || "",
    // "George", ElevenLabs' documented sample voice. Any voice ID from your library works.
    voiceId: process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb",
    model: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
  },
  higgsfield: {
    url: process.env.HIGGSFIELD_MCP_URL || "https://mcp.higgsfield.ai/mcp",
    apiKey: process.env.HIGGSFIELD_API_KEY || "",
    videoTool: process.env.HIGGSFIELD_VIDEO_TOOL || "",
    statusTool: process.env.HIGGSFIELD_STATUS_TOOL || "",
    // Image-to-video model used to animate the real screenshots (developer API only).
    i2vModel: (process.env.HIGGSFIELD_I2V_MODEL || "kling-video/v3.0/std/image-to-video").replace(/^\/+|\/+$/g, ""),
    // Cap on Higgsfield clips per video (credits). Every scene can be animated, so the default covers the max of 8.
    maxScenes: Number(process.env.HIGGSFIELD_MAX_SCENES || 8),
    /** Clips requested at once; Higgsfield answers 400 when too many run in parallel. */
    concurrency: Math.max(1, Number(process.env.HIGGSFIELD_CONCURRENCY || 3)),
  },
  limits: {
    cloneTimeoutMs: 120_000,
    maxRepoSizeMb: 300,
    installTimeoutMs: 6 * 60_000,
    startTimeoutMs: 120_000,
    jobTimeoutMs: 30 * 60_000,
  },
};
