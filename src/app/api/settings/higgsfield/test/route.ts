import { NextResponse } from "next/server";
import { getCredentials, testConnection } from "@/lib/higgsfield";
import { apiConfigured, checkApiCredentials } from "@/lib/higgsfield/api";

export const runtime = "nodejs";

export async function POST() {
  // Developer API (HF_CREDENTIALS + HIGGSFIELD_MODEL) takes priority, same as the pipeline.
  if (apiConfigured()) {
    try {
      const r = await checkApiCredentials();
      const model = process.env.HIGGSFIELD_MODEL ?? "";
      return r.ok
        ? NextResponse.json({ ok: true, tools: [model], videoTool: model, statusTool: "requests/{id}/status" })
        : NextResponse.json({ ok: false, error: r.message }, { status: 502 });
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 400) }, { status: 502 });
    }
  }
  const creds = await getCredentials();
  if (!creds) return NextResponse.json({ ok: false, error: "No Higgsfield token configured." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await testConnection(creds)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 400) }, { status: 502 });
  }
}
