import { NextResponse } from "next/server";
import { getCredentials, testConnection } from "@/lib/higgsfield";

export const runtime = "nodejs";

export async function POST() {
  const creds = await getCredentials();
  if (!creds) return NextResponse.json({ ok: false, error: "No Higgsfield token configured." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await testConnection(creds)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 400) }, { status: 502 });
  }
}
