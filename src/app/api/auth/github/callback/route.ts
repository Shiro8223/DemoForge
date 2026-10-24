import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, completeSignIn, saveAccount } from "@/lib/github/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sameState = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: NextRequest) {
  const done = (status: string) => {
    const res = NextResponse.redirect(new URL(`/settings?github=${status}#github`, req.url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/github" });
    return res;
  };
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const expected = req.cookies.get(STATE_COOKIE)?.value ?? "";
  if (req.nextUrl.searchParams.get("error")) return done("denied");
  if (!code || !expected || !sameState(state, expected)) return done("invalid-state");

  try {
    const redirectUri = new URL("/api/auth/github/callback", req.nextUrl.origin).toString();
    await saveAccount(await completeSignIn(code, redirectUri));
    return done("connected");
  } catch (e) {
    console.error("[github] sign-in failed:", (e as Error).message);
    return done("failed");
  }
}
