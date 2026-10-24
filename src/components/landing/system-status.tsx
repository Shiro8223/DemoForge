"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type Health = { worker: boolean; claude: boolean; higgsfield: boolean; ffmpeg: boolean; sandbox: string };

export function SystemStatus() {
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/health").then((r) => r.json()).then((d) => alive && setH(d)).catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!h) return <div className="h-7" />;
  const item = (ok: boolean, label: string, warn = false) => (
    <Badge variant={ok ? "success" : warn ? "warning" : "danger"} className="px-3 py-1.5">
      <span className={`size-1.5 rounded-full ${ok ? "bg-emerald-400" : warn ? "bg-amber-400" : "bg-red-400"}`} />
      {label}
    </Badge>
  );
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      {item(h.worker, h.worker ? "Worker · online" : "Worker · offline — run npm run worker")}
      {item(h.claude, h.claude ? "Claude · online" : "Claude · templates only", true)}
      <Link href="/settings">{item(h.higgsfield, h.higgsfield ? "Higgsfield · online" : "Higgsfield · not connected", true)}</Link>
      {item(h.ffmpeg, h.ffmpeg ? "FFmpeg · ready" : "FFmpeg · missing")}
      {item(h.sandbox === "docker", `Sandbox · ${h.sandbox}`, true)}
    </div>
  );
}
