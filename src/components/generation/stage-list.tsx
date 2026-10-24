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
                "absolute top-8 left-[13px] h-[calc(100%-1.75rem)] w-0.5",
                s.status === "completed" ? "bg-black" : "bg-black/15",
              )}
            />
          )}
          <StatusDot status={s.status} />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className={cn("text-sm font-bold", s.status === "pending" && "text-muted")}>{s.label}</p>
              <span className="shrink-0 font-mono text-[11px] text-muted">
                {s.status === "skipped" ? "skipped" : (elapsed(s, now) ?? "—")}
              </span>
            </div>
            {s.detail && s.status !== "running" && (
              <p
                className={cn(
                  "mt-0.5 font-mono text-xs break-words whitespace-pre-wrap",
                  s.status === "failed" ? "text-red-700" : s.status === "skipped" ? "text-amber-800" : "text-muted",
                )}
              >
                {s.detail}
              </p>
            )}
            {s.status === "running" && (
              <>
                {s.detail && (
                  <div className="mt-3 overflow-hidden rounded-xl border-2 border-black bg-panel-2 p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-black">
                    › {s.detail}
                  </div>
                )}
                <div className="shimmer relative mt-2 h-3 overflow-hidden rounded-full border-2 border-black bg-pop-blue" />
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
