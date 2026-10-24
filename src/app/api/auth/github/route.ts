import { NextResponse } from "next/server";
import { getAccount, oauthConfigured, signOut } from "@/lib/github/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who is signed in. The token itself never leaves the server. */
export async function GET() {
  const account = await getAccount();
  return NextResponse.json({
    available: oauthConfigured(),
    account: account ? { login: account.login, avatarUrl: account.avatarUrl } : null,
  });
}

export async function DELETE() {
  await signOut();
  return NextResponse.json({ ok: true });
}
