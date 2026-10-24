import { NextResponse } from "next/server";
import { execa } from "execa";
import { config } from "@/lib/config";
import { getCredentials } from "@/lib/higgsfield";
import { workerAlive } from "@/lib/storage/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ffmpeg = await execa(config.ffmpeg, ["-version"], { reject: false }).then((r) => r.exitCode === 0, () => false);
  return NextResponse.json({
    worker: await workerAlive(),
    claude: !!config.anthropicApiKey,
    higgsfield: !!(await getCredentials()),
    ffmpeg,
    sandbox: config.sandbox,
  });
}
