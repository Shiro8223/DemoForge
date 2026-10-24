import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";

/**
 * "Sign in with GitHub" for private repositories (OAuth App web flow).
 *
 * DemoForge is a single-user local service, so one connected account is stored server-side
 * in data/secrets/github.json, like the Higgsfield key. The token is used only for the GitHub
 * API and `git clone`; it never reaches the browser, job files or repository processes.
 */

const secretFile = () => path.join(config.dataRoot, "secrets", "github.json");

// `repo` is the only OAuth App scope that can read private repositories.
export const OAUTH_SCOPE = "repo read:user";

/** Short-lived cookie carrying the OAuth `state` between /login and /callback. */
export const STATE_COOKIE = "df_gh_state";

export interface GitHubAccount {
  token: string;
  login: string;
  avatarUrl: string | null;
}

export const oauthConfigured = () => !!(config.github.clientId && config.github.clientSecret);

export async function getAccount(): Promise<GitHubAccount | null> {
  try {
    const j = JSON.parse(await fs.readFile(secretFile(), "utf8")) as Partial<GitHubAccount>;
    return j.token && j.login ? { token: j.token, login: j.login, avatarUrl: j.avatarUrl ?? null } : null;
  } catch {
    return null;
  }
}

/** Token for GitHub API and clone requests: the signed-in account, else GITHUB_TOKEN. */
export async function getGitHubToken(): Promise<string | null> {
  return (await getAccount())?.token ?? (process.env.GITHUB_TOKEN || null);
}

export async function saveAccount(account: GitHubAccount) {
  await fs.mkdir(path.dirname(secretFile()), { recursive: true, mode: 0o700 });
  await fs.writeFile(secretFile(), JSON.stringify(account), { mode: 0o600 });
}

/** Forgets the account locally and revokes the grant on GitHub (best effort). */
export async function signOut() {
  const account = await getAccount();
  await fs.rm(secretFile(), { force: true });
  if (!account || !oauthConfigured()) return;
  const basic = Buffer.from(`${config.github.clientId}:${config.github.clientSecret}`).toString("base64");
  await fetch(`https://api.github.com/applications/${config.github.clientId}/grant`, {
    method: "DELETE",
    headers: { Authorization: `Basic ${basic}`, Accept: "application/vnd.github+json", "User-Agent": "DemoForge" },
    body: JSON.stringify({ access_token: account.token }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

export function authorizeUrl(state: string, redirectUri: string) {
  const u = new URL("https://github.com/login/oauth/authorize");
  u.search = new URLSearchParams({ client_id: config.github.clientId, redirect_uri: redirectUri, scope: OAUTH_SCOPE, state }).toString();
  return u.toString();
}

/** Exchanges the OAuth code for a token and looks up who it belongs to. */
export async function completeSignIn(code: string, redirectUri: string): Promise<GitHubAccount> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.github.clientId, client_secret: config.github.clientSecret, code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!j.access_token) throw new Error(j.error_description ?? "GitHub did not return a token.");

  const user = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${j.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "DemoForge" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!user.ok) throw new Error(`GitHub user lookup failed (${user.status}).`);
  const u = (await user.json()) as { login: string; avatar_url?: string };
  return { token: j.access_token, login: u.login, avatarUrl: u.avatar_url ?? null };
}
