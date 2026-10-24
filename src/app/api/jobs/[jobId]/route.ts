import { NextResponse } from "next/server";
import { deleteJob, getJob } from "@/lib/storage/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(job, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  // The worker holds a running job in memory and would write it straight back.
  if (job.status === "running") return NextResponse.json({ error: "This job is still running. Wait for it to finish first." }, { status: 409 });
  await deleteJob(jobId);
  return NextResponse.json({ ok: true });
}
