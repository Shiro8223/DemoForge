import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, authorizeUrl, oauthConfigured } from "@/lib/github/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  if (!oauthConfigured()) return NextResponse.redirect(new URL("/settings?github=not-configured#github", req.url));
  const state = randomBytes(24).toString("hex");
  const redirectUri = new URL("/api/auth/github/callback", req.nextUrl.origin).toString();
  const res = NextResponse.redirect(authorizeUrl(state, redirectUri));
  // Binds the callback to this browser (CSRF protection for the OAuth round trip).
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/api/auth/github",
    maxAge: 600,
  });
  return res;
}
