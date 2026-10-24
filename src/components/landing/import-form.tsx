"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe, Loader2 } from "lucide-react";
import { GithubIcon } from "@/components/brand";
import { SIGN_IN_URL, useGitHubStatus } from "@/components/github-account";
import { RepoPicker } from "@/components/landing/repo-picker";
import { Button } from "@/components/ui/button";

const EXAMPLE = "https://github.com/vercel/nextjs-portfolio-starter";

export function ImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const account = useGitHubStatus().status?.account;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsSignIn(false);
    setBusy(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: url, ...(liveUrl.trim() ? { liveUrl } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNeedsSignIn(!!data.needsSignIn);
        throw new Error(data.error ?? "Something went wrong");
      }
      router.push(`/jobs/${data.jobId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    // The repo picker adds a 48px button + 8px gap, so the form grows by 56px to keep the URL box at its original width.
    <form onSubmit={submit} className={`mx-auto w-full text-left ${account ? "" : "max-w-xl"}`}>
      <div className="flex flex-col gap-2 rounded-2xl border-3 border-black bg-white p-2 shadow-brutal-lg sm:flex-row">
        <div className="flex min-w-0 gap-2 sm:flex-1">
          {account && <RepoPicker onSelect={(u) => (setUrl(u), setError(null))} />}
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border-2 border-black bg-panel-2 px-3.5 transition duration-150 focus-within:bg-pop-yellow/25">
            <GithubIcon className="size-[18px] shrink-0 text-black" />
            <span className="sr-only">GitHub repository URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="github.com/owner/repo"
              spellCheck={false}
              autoComplete="off"
              className="w-full min-w-0 bg-transparent font-mono text-sm text-fg focus:outline-none"
            />
          </label>
        </div>
        <Button type="submit" size="lg" disabled={busy || !url.trim()} className="text-sm font-semibold">
          {busy ? <Loader2 className="animate-spin" /> : null}
          Generate demo
          {!busy && <ArrowRight />}
        </Button>
      </div>
      <label className="mt-2 flex h-11 min-w-0 items-center gap-2.5 rounded-xl border-2 border-black bg-white px-3.5 transition duration-150 focus-within:bg-pop-yellow/25">
        <Globe className="size-4 shrink-0 text-black" aria-hidden />
        <span className="sr-only">Live site URL (optional)</span>
        <input
          value={liveUrl}
          onChange={(e) => setLiveUrl(e.target.value)}
          placeholder="Live site URL (optional, e.g. your-app.vercel.app)"
          spellCheck={false}
          autoComplete="off"
          inputMode="url"
          className="w-full min-w-0 bg-transparent font-mono text-sm text-fg placeholder:text-muted focus:outline-none"
        />
      </label>
      <div className="mt-3 flex min-h-5 flex-wrap items-center justify-center gap-2 px-1 text-xs">
        {error ? (
          <p role="alert" className="rounded-lg border-2 border-black bg-pop-red/25 px-3 py-1.5 font-bold text-black">
            {error}
            {needsSignIn && (
              <>
                {" "}
                <a href={SIGN_IN_URL} className="underline decoration-2 underline-offset-4">
                  Sign in with GitHub
                </a>
              </>
            )}
          </p>
        ) : (
          <p className="text-muted">
            Public or private repos (sign in) · Deployed? Add the live URL and we&apos;ll film that instead of running your code ·{" "}
            <button type="button" onClick={() => setUrl(EXAMPLE)} className="font-bold text-black underline decoration-pop-pink decoration-[3px] underline-offset-4">
              Try an example
            </button>
          </p>
        )}
      </div>
    </form>
  );
}
