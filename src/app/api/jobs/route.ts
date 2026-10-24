import { NextResponse } from "next/server";
import { listJobs } from "@/lib/storage/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await listJobs(12);
  return NextResponse.json(
    jobs.map((j) => ({
      id: j.id,
      projectId: j.projectId,
      name: j.outputs.analysis?.name ?? j.repo,
      status: j.status,
      poster: j.outputs.poster ?? null,
      createdAt: j.createdAt,
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
