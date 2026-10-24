"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Logs = { install?: string; start?: string };

/** The repo's install and dev-server output, streamed into the page instead of a terminal window. */
export function AppConsole({ jobId, active }: { jobId: string; active: boolean }) {
  const [logs, setLogs] = useState<Logs>({});
  const [tab, setTab] = useState<keyof Logs | null>(null);
  const pre = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const load = () =>
      fetch(`/api/jobs/${jobId}/logs`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : {}))
        .then(setLogs)
        .catch(() => {});
    const first = setTimeout(load, 0);
    const t = active ? setInterval(load, 2000) : undefined;
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [jobId, active]);

  // Follow the newest log until the user picks one.
  const shown = tab ?? (logs.start ? "start" : logs.install ? "install" : null);
  const text = shown ? logs[shown] : undefined;

  useEffect(() => {
    const el = pre.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [text]);

  if (!logs.install && !logs.start) return null;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><Terminal className="size-4" /> App console</CardTitle>
          <CardDescription className="mt-0.5">The repo runs hidden in the background; its output lands here.</CardDescription>
        </div>
        <div className="flex gap-1.5">
          {(["install", "start"] as const).map((k) =>
            logs[k] ? (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn("brutal-press rounded-lg border-2 border-black px-2.5 py-1 text-[12px] font-bold text-black", shown === k ? "bg-pop-cyan shadow-brutal-sm" : "bg-white")}
              >
                {k === "install" ? "Install" : "Dev server"}
              </button>
            ) : null,
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <pre ref={pre} className="max-h-72 overflow-auto rounded-xl border-3 border-black bg-black p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-pop-green">
          {text}
        </pre>
      </CardContent>
    </Card>
  );
}
