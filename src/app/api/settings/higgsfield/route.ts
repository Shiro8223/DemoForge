import { NextResponse } from "next/server";
import { clearCredentials, getCredentials, maskToken, saveCredentials } from "@/lib/higgsfield";
import { higgsfieldSettingsSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The token itself never leaves the server; the browser only sees a masked hint. */
export async function GET() {
  const c = await getCredentials();
  return NextResponse.json(c ? { configured: true, source: c.source, hint: maskToken(c.token), url: c.url } : { configured: false });
}

export async function POST(req: Request) {
  const body = higgsfieldSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid token" }, { status: 400 });
  if (body.data.url && !body.data.url.startsWith("https://"))
    return NextResponse.json({ error: "MCP URL must use https" }, { status: 400 });
  await saveCredentials(body.data.token, body.data.url);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearCredentials();
  return NextResponse.json({ ok: true });
}
