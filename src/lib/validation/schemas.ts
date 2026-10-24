import { z } from "zod";

export const repoUrlSchema = z
  .string()
  .trim()
  .min(1, "Paste a GitHub repository URL")
  .max(300);

export const generateRequestSchema = z.object({ repoUrl: repoUrlSchema });

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
});
export type Scene = z.infer<typeof sceneSchema>;

export const storyboardSchema = z
  .object({
    project: z.string(),
    duration: z.number(),
    aspectRatio: z.literal("9:16"),
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
});

export const higgsfieldSettingsSchema = z.object({
  token: z.string().trim().min(8).max(4096),
  url: z.string().trim().url().optional(),
});
