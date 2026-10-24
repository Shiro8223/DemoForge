import { NextResponse } from "next/server";
import { listJobs } from "@/lib/storage/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit")) || 12;
  const jobs = await listJobs(Math.min(Math.max(limit, 1), 200));
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
