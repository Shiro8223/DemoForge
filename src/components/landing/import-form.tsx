"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderGit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const EXAMPLE = "https://github.com/vercel/nextjs-portfolio-starter";

export function ImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
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
        body: JSON.stringify({ repoUrl: url }),
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
    <form onSubmit={submit} className="w-full max-w-2xl">
      <div className="group relative rounded-2xl bg-gradient-to-r from-violet-500/50 via-indigo-500/30 to-cyan-400/50 p-px shadow-[0_20px_60px_-20px_rgb(139_92_246/0.5)]">
        <div className="flex flex-col gap-2 rounded-2xl bg-panel p-2 sm:flex-row sm:items-center">
          <label className="flex min-w-0 flex-1 items-center gap-3 px-3">
            <FolderGit2 className="size-5 shrink-0 text-muted" />
            <span className="sr-only">GitHub repository URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="github.com/your-team/your-project"
              spellCheck={false}
              autoComplete="off"
              className="h-12 w-full min-w-0 bg-transparent font-mono text-[15px] text-fg placeholder:text-muted/60 focus:outline-none"
            />
          </label>
          <Button type="submit" size="lg" disabled={busy || !url.trim()} className="sm:w-auto">
            {busy ? <Loader2 className="animate-spin" /> : null}
            Generate Demo
            {!busy && <ArrowRight />}
          </Button>
        </div>
      </div>
      <div className="mt-3 flex min-h-5 flex-wrap items-center justify-between gap-2 px-1 text-sm">
        {error ? (
          <p role="alert" className="text-red-300">{error}</p>
        ) : (
          <p className="text-muted">
            Public repos · Next.js, Vite, Node and static sites work best.{" "}
            <button type="button" onClick={() => setUrl(EXAMPLE)} className="text-violet-300 underline-offset-4 hover:underline">
              Try an example
            </button>
          </p>
        )}
      </div>
    </form>
  );
}
