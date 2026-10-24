import { NextResponse } from "next/server";
import { getAccount, listUserRepos } from "@/lib/github/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's repositories for the home-page picker. Only names/metadata, never the token. */
export async function GET() {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Not signed in to GitHub." }, { status: 401 });
  try {
    return NextResponse.json({ repos: await listUserRepos(account.token) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
