import { NextResponse } from "next/server";
import { parseGitHubUrl } from "@/lib/github";
import { createJob, listJobs } from "@/lib/storage/jobs";
import { generateRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

const MAX_QUEUED = 5;

export async function POST(req: Request) {
  const body = generateRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  let parsed;
  try {
    parsed = parseGitHubUrl(body.data.repoUrl);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const active = (await listJobs(100)).filter((j) => j.status === "pending" || j.status === "running");
  if (active.length >= MAX_QUEUED)
    return NextResponse.json({ error: "The generation queue is full. Try again in a few minutes." }, { status: 429 });

  const job = await createJob({ repoUrl: parsed.webUrl, owner: parsed.owner, repo: parsed.repo });
  return NextResponse.json({ jobId: job.id }, { status: 201 });
}
