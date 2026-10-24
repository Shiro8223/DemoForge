import { NextResponse } from "next/server";
import { z } from "zod";
import { getJob, saveJob } from "@/lib/storage/jobs";
import { apiConfigured } from "@/lib/higgsfield/api";
import { runtimeOf } from "@/lib/storyboard";
import { sceneEditSchema, storyboardSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

const bodySchema = sceneEditSchema.extend({ regenerate: z.boolean().optional() });

/** Edit one scene and queue a re-assembly (optionally re-generating that scene with Higgsfield). */
export async function PATCH(req: Request, ctx: { params: Promise<{ jobId: string; sceneId: string }> }) {
  const { jobId, sceneId } = await ctx.params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status === "pending" || job.status === "running")
    return NextResponse.json({ error: "This job is still running." }, { status: 409 });
  const sb = job.outputs.storyboard;
  const scene = sb?.scenes.find((s) => s.id === sceneId);
  if (!sb || !scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid edit" }, { status: 400 });
  const { regenerate, ...edit } = body.data;
  // Screenshot scenes are animated from the real UI with image-to-video, which only the developer API supports.
  if (regenerate && scene.visualType !== "generated" && !(scene.visualType === "screenshot" && apiConfigured()))
    return NextResponse.json({ error: "Re-animating screenshot scenes needs the Higgsfield developer API (HF_CREDENTIALS)." }, { status: 400 });

  Object.assign(scene, Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== undefined)));
  sb.duration = runtimeOf(sb.scenes);
  const valid = storyboardSchema.safeParse(sb);
  if (!valid.success) return NextResponse.json({ error: valid.error.issues[0]?.message }, { status: 400 });

  job.outputs.storyboard = valid.data;
  job.mode = "reassemble";
  job.regenerateSceneId = regenerate ? sceneId : undefined;
  job.status = "pending";
  job.error = undefined;
  for (const s of job.stages) {
    if (s.id === "assemble" || (regenerate && s.id === "generate") || (edit.narration !== undefined && s.id === "voiceover")) {
      s.status = "pending";
      s.detail = undefined;
    }
  }
  await saveJob(job);
  return NextResponse.json({ ok: true });
}
