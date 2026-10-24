"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, CircleCheck, Loader2, LogOut, Settings, TriangleAlert } from "lucide-react";
import { GithubIcon } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Status = { available: boolean; account: { login: string; avatarUrl: string | null } | null };

export const SIGN_IN_URL = "/api/auth/github/login";

function useGitHubStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const load = () =>
    fetch("/api/auth/github", { cache: "no-store" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);
  return { status, reload: load };
}

function Avatar({ url, size }: { url: string | null; size: string }) {
  if (!url) return <GithubIcon className={size} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={`${size} rounded-full`} />;
}

/** Header control: who is signed in to GitHub (with a sign-out menu), or a sign-in button. */
export function HeaderGitHub() {
  const { status, reload } = useGitHubStatus();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function signOut() {
    setOpen(false);
    await fetch("/api/auth/github", { method: "DELETE" });
    reload();
  }

  if (!status) return <span className="h-8 w-8 sm:w-24" aria-hidden />;
  const base = "flex h-8 items-center gap-2 rounded-lg border border-line px-2 text-[13px] transition-colors duration-150 hover:border-line-strong sm:px-2.5";

  if (!status.account)
    return (
      // Without OAuth keys, "Sign in" leads to the setup steps instead of a dead end.
      <a href={status.available ? SIGN_IN_URL : "/settings#github"} className={`${base} text-muted hover:text-fg`} aria-label="Sign in with GitHub">
        <GithubIcon /> <span className="hidden sm:inline">Sign in</span>
      </a>
    );

  const { login, avatarUrl } = status.account;
  return (
    <div ref={menu} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Signed in to GitHub as ${login}`}
        className={`${base} text-fg`}
      >
        <Avatar url={avatarUrl} size="size-5" />
        <span className="hidden max-w-32 truncate sm:inline">@{login}</span>
        <ChevronDown className={`hidden size-3.5 text-muted transition-transform sm:block ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/50">
          <div className="border-b border-line px-3.5 py-3">
            <p className="text-xs text-muted">Signed in to GitHub as</p>
            <p className="mt-0.5 truncate text-sm font-medium text-fg">@{login}</p>
          </div>
          <a role="menuitem" href={`https://github.com/${login}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3.5 py-2.5 text-[13px] text-muted hover:bg-panel-2 hover:text-fg">
            <GithubIcon /> View profile
          </a>
          <a role="menuitem" href="/settings#github" className="flex items-center gap-2 px-3.5 py-2.5 text-[13px] text-muted hover:bg-panel-2 hover:text-fg">
            <Settings className="size-4" /> GitHub settings
          </a>
          <button role="menuitem" type="button" onClick={signOut} className="flex w-full items-center gap-2 border-t border-line px-3.5 py-2.5 text-left text-[13px] text-red-300 hover:bg-panel-2">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const RESULT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Signed in. Private repositories you can access will now work." },
  denied: { ok: false, text: "GitHub sign-in was cancelled." },
  "invalid-state": { ok: false, text: "Sign-in expired or came from another browser. Try again." },
  failed: { ok: false, text: "GitHub sign-in failed. Check the server log and the OAuth App settings." },
  "not-configured": { ok: false, text: "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET first (see below)." },
};

/** Settings card for the GitHub connection. */
export function GitHubSettings() {
  const { status, reload } = useGitHubStatus();
  const [busy, setBusy] = useState(false);
  const result = RESULT[useSearchParams().get("github") ?? ""];

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/github", { method: "DELETE" });
    await reload();
    setBusy(false);
  }

  return (
    <section id="github" className="card-inset scroll-mt-20 rounded-2xl border border-line bg-panel/80 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel-2 text-fg">
            <GithubIcon className="size-[18px]" />
          </span>
          <div>
            <h2 className="text-xl">GitHub</h2>
            <p className="mt-0.5 text-[13px] text-muted">Private repository access</p>
          </div>
        </div>
        {status?.account ? (
          <Badge variant="success">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Signed in as @{status.account.login}
          </Badge>
        ) : (
          <Badge>{status?.available ? "Public repos only" : "Not configured"}</Badge>
        )}
      </div>

      {result && (
        <p className={`mt-4 flex items-center gap-2 text-[13px] ${result.ok ? "text-emerald-300" : "text-amber-300"}`}>
          {result.ok ? <CircleCheck className="size-4 shrink-0" /> : <TriangleAlert className="size-4 shrink-0" />} {result.text}
        </p>
      )}

      <p className="mt-4 text-sm leading-relaxed text-muted">
        Sign in to generate demos from private repositories. The token is kept server-side in{" "}
        <code className="font-mono text-fg">data/secrets/github.json</code> and used only to clone and read repo metadata. It is never sent to the
        browser or to repository code.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {status?.account ? (
          <Button variant="secondary" onClick={signOut} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out
          </Button>
        ) : (
          <Button asChild disabled={!status?.available}>
            <a href={SIGN_IN_URL} aria-disabled={!status?.available}>
              <GithubIcon /> Sign in with GitHub
            </a>
          </Button>
        )}
      </div>

      {status && !status.available && (
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          One-time setup: create an OAuth App at <span className="font-mono text-fg">github.com/settings/developers</span> with callback URL{" "}
          <code className="font-mono text-fg">http://localhost:3000/api/auth/github/callback</code>, then set{" "}
          <code className="font-mono text-fg">GITHUB_CLIENT_ID</code> and <code className="font-mono text-fg">GITHUB_CLIENT_SECRET</code> in{" "}
          <code className="font-mono text-fg">.env</code> and restart.
        </p>
      )}
      <p className="mt-4 text-xs text-muted">
        GitHub&apos;s <code className="font-mono">repo</code> scope is the only OAuth scope that can read private repositories, and it also allows
        writes. DemoForge only reads. Signing out revokes the grant on GitHub.
      </p>
    </section>
  );
}
