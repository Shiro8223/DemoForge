"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { StatusDot } from "./status-dot";
import type { StageState } from "@/types";

function elapsed(s: StageState, now: number) {
  if (!s.startedAt) return null;
  const end = s.finishedAt ? Date.parse(s.finishedAt) : now;
  const sec = Math.max(0, Math.round((end - Date.parse(s.startedAt)) / 1000));
  return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
}

export function StageList({ stages }: { stages: StageState[] }) {
  const [now, setNow] = useState(() => Date.now());
  const running = stages.some((s) => s.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  return (
    <ol className="relative">
      {stages.map((s, i) => (
        <li key={s.id} className="relative flex gap-4 pb-5 last:pb-0">
          {i < stages.length - 1 && (
            <span
              className={cn(
                "absolute top-7 left-3 h-[calc(100%-1.5rem)] w-px",
                s.status === "completed" ? "bg-emerald-500/30" : "bg-line",
              )}
            />
          )}
          <StatusDot status={s.status} />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className={cn("text-sm font-medium", s.status === "pending" && "text-muted")}>{s.label}</p>
              <span className="shrink-0 font-mono text-[11px] text-muted">
                {s.status === "skipped" ? "skipped" : elapsed(s, now)}
              </span>
            </div>
            {s.detail && (
              <p
                className={cn(
                  "mt-0.5 font-mono text-xs break-words whitespace-pre-wrap",
                  s.status === "failed" ? "text-red-300/90" : s.status === "skipped" ? "text-amber-200/80" : "text-muted",
                )}
              >
                {s.detail}
              </p>
            )}
            {s.status === "running" && <div className="shimmer mt-2 h-0.5 rounded-full" />}
          </div>
        </li>
      ))}
    </ol>
  );
}
