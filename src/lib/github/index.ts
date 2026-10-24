import fs from "node:fs/promises";
import path from "node:path";
import { simpleGit } from "simple-git";
import { config } from "@/lib/config";
import { getGitHubToken } from "@/lib/github/auth";

export interface ParsedRepo {
  owner: string;
  repo: string;
  /** Canonical https clone URL we construct ourselves (never the raw user input). */
  cloneUrl: string;
  webUrl: string;
}

const NAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/;

/**
 * Accepts `https://github.com/owner/repo`, with optional `.git`, trailing slash,
 * or `/tree/...` suffix, and the shorthand `owner/repo`. Anything else is rejected.
 */
export function parseGitHubUrl(input: string): ParsedRepo {
  let s = input.trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(s)) s = `https://github.com/${s}`;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new Error("That doesn't look like a URL.");
  }
  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase()))
    throw new Error("Only github.com repositories are supported.");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed.");

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("URL must point to a repository: github.com/owner/repo");
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!NAME_RE.test(owner) || !NAME_RE.test(repo) || repo === "." || repo === "..")
    throw new Error("Invalid owner or repository name.");

  return {
    owner,
    repo,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    webUrl: `https://github.com/${owner}/${repo}`,
  };
}

export interface RepoMeta {
  description: string | null;
  homepage: string | null;
  stars: number | null;
  topics: string[];
  language: string | null;
}

async function repoApi(owner: string, repo: string) {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "DemoForge" };
  const token = await getGitHubToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers, signal: AbortSignal.timeout(10_000) });
}

/**
 * Up-front check so a private or missing repo fails at submit time, not inside the worker.
 * GitHub answers 404 for private repos the caller cannot see. Network trouble is "unknown".
 */
export async function checkRepoAccess(owner: string, repo: string): Promise<"ok" | "missing" | "unknown"> {
  try {
    const res = await repoApi(owner, repo);
    return res.ok ? "ok" : res.status === 404 ? "missing" : "unknown";
  } catch {
    return "unknown";
  }
}

/** Best-effort GitHub API metadata. Failure is non-fatal. */
export async function fetchRepoMeta(owner: string, repo: string): Promise<RepoMeta | null> {
  try {
    const res = await repoApi(owner, repo);
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    return {
      description: (j.description as string) ?? null,
      homepage: (j.homepage as string) || null,
      stars: typeof j.stargazers_count === "number" ? j.stargazers_count : null,
      topics: Array.isArray(j.topics) ? (j.topics as string[]) : [],
      language: (j.language as string) ?? null,
    };
  } catch {
    return null;
  }
}

async function dirSizeMb(dir: string): Promise<number> {
  let total = 0;
  const walk = async (d: string) => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) total += (await fs.stat(p)).size;
    }
  };
  await walk(dir);
  return total / 1024 / 1024;
}

/** Shallow-clones into a fresh, job-unique directory. Returns the repo path. */
export async function cloneRepository(parsed: ParsedRepo, workspace: string): Promise<string> {
  const target = path.join(workspace, "repo");
  if (!target.startsWith(path.resolve(config.workspaceRoot) + path.sep))
    throw new Error("Workspace escaped the workspace root");
  await fs.mkdir(workspace, { recursive: true });

  // Never let git prompt for credentials or read the host's git config/credential helpers.
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: workspace,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_LFS_SKIP_SMUDGE: "1",
    ...(process.env.HTTPS_PROXY ? { HTTPS_PROXY: process.env.HTTPS_PROXY } : {}),
    ...(process.env.https_proxy ? { https_proxy: process.env.https_proxy } : {}),
    ...(process.env.GIT_SSL_CAINFO ? { GIT_SSL_CAINFO: process.env.GIT_SSL_CAINFO } : {}),
  };
  // Private repos: hand git the token as an auth header via env config, so it never appears
  // in the clone URL, argv, or the cloned repo's .git/config.
  const token = await getGitHubToken();
  if (token) {
    const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
    Object.assign(env, {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    });
  }
  // simple-git blocks custom env vars and core.hooksPath by default; both are ours and
  // only tighten git (hooksPath is set to disable hooks, see below).
  const git = simpleGit({
    timeout: { block: config.limits.cloneTimeoutMs },
    allowEnvironment: Object.keys(env),
    unsafe: { allowUnsafeHooksPath: true },
  }).env(env);
  // core.symlinks=false: symlinks are checked out as plain files, so nothing we
  // later read for analysis can point outside the workspace.
  try {
    await git.clone(parsed.cloneUrl, target, [
      "--depth",
      "1",
      "--single-branch",
      "--no-tags",
      "-c",
      "core.symlinks=false",
      "-c",
      "core.hooksPath=/dev/null",
    ]);
  } catch (e) {
    // With prompts disabled, a private repo surfaces as an auth or "not found" error.
    if (/could not read Username|Authentication failed|Repository not found|returned error: 40[134]/i.test((e as Error).message))
      throw new Error(
        token
          ? `GitHub denied access to ${parsed.owner}/${parsed.repo}. Check that the signed-in account can see it.`
          : `${parsed.owner}/${parsed.repo} is private or does not exist. Sign in with GitHub to use private repositories.`,
      );
    throw e;
  }

  const size = await dirSizeMb(target);
  if (size > config.limits.maxRepoSizeMb)
    throw new Error(`Repository is ${size.toFixed(0)} MB; the limit is ${config.limits.maxRepoSizeMb} MB.`);
  return target;
}
