"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe, Loader2 } from "lucide-react";
import { GithubIcon } from "@/components/brand";
import { Button } from "@/components/ui/button";

const EXAMPLE = "https://github.com/vercel/nextjs-portfolio-starter";

export function ImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: url, ...(liveUrl.trim() ? { liveUrl } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      router.push(`/jobs/${data.jobId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full text-left">
      <div className="card-inset flex flex-col gap-2 rounded-2xl border border-line bg-panel p-2 sm:flex-row">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-panel-2 px-3.5 transition duration-150 focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/30">
          <GithubIcon className="size-[18px] shrink-0 text-muted" />
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
        <Button type="submit" size="lg" disabled={busy || !url.trim()} className="text-sm font-semibold">
          {busy ? <Loader2 className="animate-spin" /> : null}
          Generate demo
          {!busy && <ArrowRight />}
        </Button>
      </div>
      <label className="mt-2 flex h-11 min-w-0 items-center gap-2.5 rounded-xl border border-line bg-panel px-3.5 transition duration-150 focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/30">
        <Globe className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="sr-only">Live site URL (optional)</span>
        <input
          value={liveUrl}
          onChange={(e) => setLiveUrl(e.target.value)}
          placeholder="Live site URL (optional, e.g. your-app.vercel.app)"
          spellCheck={false}
          autoComplete="off"
          inputMode="url"
          className="w-full min-w-0 bg-transparent font-mono text-sm text-fg placeholder:text-muted/70 focus:outline-none"
        />
      </label>
      <div className="mt-3 flex min-h-5 flex-wrap items-center justify-center gap-2 px-1 text-xs">
        {error ? (
          <p role="alert" className="text-red-300">{error}</p>
        ) : (
          <p className="text-muted">
            Already deployed? Add the live URL and we&apos;ll film that instead of running your code ·{" "}
            <button type="button" onClick={() => setUrl(EXAMPLE)} className="text-violet-300 underline-offset-4 hover:underline">
              Try an example
            </button>
          </p>
        )}
      </div>
    </form>
  );
}
