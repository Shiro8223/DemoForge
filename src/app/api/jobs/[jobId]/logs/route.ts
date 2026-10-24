import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isValidJobId, jobDir } from "@/lib/storage/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGS = ["install", "start"] as const;
const MAX = 20_000;

/** Tail of the repo's install / dev-server output, shown in the job page console (instead of a terminal window). */
export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const out: Record<string, string> = {};
  for (const name of LOGS) {
    const text = await fs.readFile(path.join(jobDir(jobId), "logs", `${name}.log`), "utf8").catch(() => "");
    const clean = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r(?!\n)/g, "\n");
    if (clean) out[name] = clean.length > MAX ? "…" + clean.slice(-MAX) : clean;
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
