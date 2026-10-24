import type { ProjectAnalysis, Storyboard } from "@/lib/validation/schemas";

export type { ProjectAnalysis, Storyboard, Scene } from "@/lib/validation/schemas";

export const STAGES = [
  { id: "clone", label: "Clone repository" },
  { id: "analyze", label: "Analyse repository" },
  { id: "install", label: "Install dependencies" },
  { id: "start", label: "Start application" },
  { id: "discover", label: "Discover features" },
  { id: "screenshots", label: "Capture screenshots" },
  { id: "summary", label: "Write summary" },
  { id: "storyboard", label: "Build storyboard" },
  { id: "generate", label: "Generate cinematic scenes" },
  { id: "assemble", label: "Assemble video" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface StageState {
  id: StageId;
  label: string;
  status: StageStatus;
  /** Short human-readable detail, e.g. "npm install (42s)" or a skip reason. */
  detail?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface Screenshot {
  /** Route path that was captured, e.g. "/" or "/dashboard". */
  route: string;
  title: string;
  /** Paths relative to the job output dir. */
  desktop: string;
  mobile: string;
}

export interface GeneratedScene {
  sceneId: string;
  /** Relative path of the downloaded clip. */
  file: string;
  source: "higgsfield";
  tool: string;
  prompt: string;
}

export interface JobOutputs {
  analysis?: ProjectAnalysis;
  screenshots?: Screenshot[];
  summary?: string; // relative path to summary.md
  storyboard?: Storyboard;
  generatedScenes?: GeneratedScene[];
  video?: string; // relative path to final-demo.mp4
  poster?: string;
  /** Who produced the summary/storyboard: Claude or the deterministic fallback. */
  authoredBy?: "claude" | "template";
  appUrl?: string;
}

export interface Job {
  id: string;
  projectId: string;
  repoUrl: string;
  owner: string;
  repo: string;
  status: JobStatus;
  currentStage?: StageId;
  stages: StageState[];
  error?: string;
  /** Non-fatal limitations the user should know about (missing keys, skipped routes...). */
  notices: string[];
  outputs: JobOutputs;
  /** When set, the worker only re-runs assembly (scene edit) instead of the full pipeline. */
  mode: "full" | "reassemble";
  /** In reassemble mode: re-request this scene from Higgsfield before assembling. */
  regenerateSceneId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Shape returned to the browser. Same as Job; kept separate in case we ever redact. */
export type PublicJob = Job;
