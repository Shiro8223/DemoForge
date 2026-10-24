import { z } from "zod";

export const repoUrlSchema = z
  .string()
  .trim()
  .min(1, "Paste a GitHub repository URL")
  .max(300);

export const ASPECT_RATIOS = ["9:16", "16:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** Colour grades applied to the final cut (and hinted to Higgsfield so AI footage matches). */
export const FILTERS = ["none", "cinematic", "noir", "vintage", "vivid", "warm", "cool"] as const;
export type VideoFilter = (typeof FILTERS)[number];

export const LIMITS = { minDuration: 10, maxDuration: 30, minScenes: 3, maxScenes: 8, minSecondsPerScene: 3 } as const;

/** Most scenes that fit a length while keeping each one readable. */
export const maxScenesFor = (duration: number) =>
  Math.max(LIMITS.minScenes, Math.min(LIMITS.maxScenes, Math.floor(duration / LIMITS.minSecondsPerScene)));

/** Suggested custom instructions (greyed out, Tab accepts). Also the Higgsfield motion direction when the field is empty. */
export const RECOMMENDED_HIGGSFIELD_PROMPT =
  "A sleek product-launch tour of the real app: smooth cinematic zooms and pans that flow from one screen into the next, " +
  "building from the first impression to the key feature. Confident, premium and modern pacing; the interface stays crisp " +
  "and exactly as captured.";

/** Camera style for every shot: Higgsfield's motion prompt and the local zoom/pan animation. */
export const MOTIONS = ["glide", "zoom", "dramatic"] as const;
export type MotionStyle = (typeof MOTIONS)[number];

/** Narrator delivery: shapes the script's wording and ElevenLabs' voice settings. */
export const VOICE_TONES = ["friendly", "hype", "calm", "epic"] as const;
export type VoiceTone = (typeof VOICE_TONES)[number];

/** ElevenLabs premade voices offered in the picker. "" = the server's ELEVENLABS_VOICE_ID. */
export const VOICES = [
  { id: "", name: "Default", hint: "George, or your ELEVENLABS_VOICE_ID" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", hint: "Deep narrator" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", hint: "Bright, confident" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", hint: "Young, energetic" },
] as const;

/** Options picked on the home page before a generation starts. */
export const generationSettingsSchema = z
  .object({
    aspectRatio: z.enum(ASPECT_RATIOS).default("9:16"),
    duration: z.number().int().min(LIMITS.minDuration).max(LIMITS.maxDuration).default(25),
    sceneCount: z.number().int().min(LIMITS.minScenes).max(LIMITS.maxScenes).default(6),
    filter: z.enum(FILTERS).default("none"),
    voiceover: z.boolean().default(false),
    /** Optional creative direction from the user, passed to Gemini and every Higgsfield prompt. */
    instructions: z.string().trim().max(1000).default(""),
    /** Animate each screenshot so it morphs into the next one (Higgsfield end frame), for one continuous take. */
    blendShots: z.boolean().default(true),
    motion: z.enum(MOTIONS).default("glide"),
    voiceId: z.enum(VOICES.map((v) => v.id) as [string, ...string[]]).default(""),
    voiceTone: z.enum(VOICE_TONES).default("friendly"),
  })
  .transform((s) => ({ ...s, sceneCount: Math.min(s.sceneCount, maxScenesFor(s.duration)) }));
export type GenerationSettings = z.infer<typeof generationSettingsSchema>;
export const DEFAULT_SETTINGS: GenerationSettings = generationSettingsSchema.parse({});

export const generateRequestSchema = z.object({ repoUrl: repoUrlSchema, settings: generationSettingsSchema.optional() });

export const projectAnalysisSchema = z.object({
  name: z.string(),
  description: z.string(),
  framework: z.string(),
  languages: z.array(z.string()),
  packageManager: z.enum(["npm", "pnpm", "yarn", "bun", "none"]),
  /** Package script names (never raw shell) used to install/start. */
  installCommand: z.string(),
  startScript: z.string().nullable(),
  /** "static" means DemoForge serves the files itself. */
  runKind: z.enum(["script", "static", "unsupported"]),
  appDir: z.string(),
  likelyPort: z.number().int().nullable(),
  requiredEnv: z.array(z.string()),
  routes: z.array(z.string()),
  features: z.array(z.string()),
  setupRisks: z.array(z.string()),
  // "claude" is kept so jobs created before the Gemini migration still load.
  analysedBy: z.enum(["gemini", "claude", "heuristic"]),
});
export type ProjectAnalysis = z.infer<typeof projectAnalysisSchema>;

export const TRANSITIONS = ["fade", "cut", "slideleft", "slideup", "circleopen", "dissolve", "zoomin"] as const;

export const sceneSchema = z.object({
  id: z.string(),
  title: z.string(),
  duration: z.number().min(1.5).max(10),
  purpose: z.string(),
  visualType: z.enum(["generated", "screenshot"]),
  visualDescription: z.string(),
  videoPrompt: z.string(),
  screenshot: z.string().nullable(),
  textOverlay: z.string().max(80),
  transition: z.enum(TRANSITIONS),
  audioDirection: z.string(),
  /** Spoken voiceover line (ElevenLabs). Optional so storyboards from older jobs still load. */
  narration: z.string().max(300).optional(),
});
export type Scene = z.infer<typeof sceneSchema>;

export const storyboardSchema = z
  .object({
    project: z.string(),
    duration: z.number(),
    aspectRatio: z.enum(ASPECT_RATIOS),
    visualStyle: z.string(),
    musicDirection: z.string(),
    scenes: z.array(sceneSchema).min(2).max(10),
  })
  .superRefine((sb, ctx) => {
    const ids = new Set<string>();
    sb.scenes.forEach((s, i) => {
      if (ids.has(s.id)) ctx.addIssue({ code: "custom", path: ["scenes", i, "id"], message: "duplicate scene id" });
      ids.add(s.id);
      if (s.visualType === "screenshot" && !s.screenshot)
        ctx.addIssue({ code: "custom", path: ["scenes", i, "screenshot"], message: "screenshot scene needs a screenshot" });
    });
  });
export type Storyboard = z.infer<typeof storyboardSchema>;

/** User edits to a single scene (P1: edit + re-assemble). */
export const sceneEditSchema = z.object({
  textOverlay: z.string().trim().max(80).optional(),
  duration: z.number().min(1.5).max(10).optional(),
  transition: z.enum(TRANSITIONS).optional(),
  videoPrompt: z.string().trim().max(600).optional(),
  narration: z.string().trim().max(300).optional(),
});

export const higgsfieldSettingsSchema = z.object({
  token: z.string().trim().min(8).max(4096),
  url: z.string().trim().url().optional(),
});
