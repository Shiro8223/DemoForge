import { NextResponse } from "next/server";
import { createJob, getJob } from "@/lib/storage/jobs";

export const runtime = "nodejs";

/** Starts a fresh full generation for the same repository. */
export async function POST(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const next = await createJob({ repoUrl: job.repoUrl, owner: job.owner, repo: job.repo, settings: job.settings });
  return NextResponse.json({ jobId: next.id }, { status: 201 });
}
