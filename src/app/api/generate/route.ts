import { NextResponse } from "next/server";
import { checkRepoAccess, parseGitHubUrl } from "@/lib/github";
import { getAccount } from "@/lib/github/auth";
import { createJob, listJobs } from "@/lib/storage/jobs";
import { generateRequestSchema } from "@/lib/validation/schemas";
import { assertPublicLiveUrl, parseLiveUrl } from "@/lib/validation/live-url";

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

  let liveUrl: string | undefined;
  if (body.data.liveUrl) {
    try {
      const live = parseLiveUrl(body.data.liveUrl);
      await assertPublicLiveUrl(live);
      liveUrl = live.url;
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  const active = (await listJobs(100)).filter((j) => j.status === "pending" || j.status === "running");
  if (active.length >= MAX_QUEUED)
    return NextResponse.json({ error: "The generation queue is full. Try again in a few minutes." }, { status: 429 });

  if ((await checkRepoAccess(parsed.owner, parsed.repo)) === "missing") {
    const account = await getAccount();
    return NextResponse.json(
      {
        error: account
          ? `${parsed.owner}/${parsed.repo} was not found, or @${account.login} doesn't have access to it.`
          : `${parsed.owner}/${parsed.repo} was not found. If it's private, sign in with GitHub first.`,
        needsSignIn: !account,
      },
      { status: 404 },
    );
  }

  const job = await createJob({ repoUrl: parsed.webUrl, owner: parsed.owner, repo: parsed.repo, liveUrl });
  return NextResponse.json({ jobId: job.id }, { status: 201 });
}
