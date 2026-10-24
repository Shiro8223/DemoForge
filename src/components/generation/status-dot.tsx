import { Check, Loader2, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobStatus, StageStatus } from "@/types";

export function StatusDot({ status, className }: { status: StageStatus | JobStatus; className?: string }) {
  const base = "grid size-6 shrink-0 place-items-center rounded-full border [&_svg]:size-3.5";
  switch (status) {
    case "completed":
      return <span className={cn(base, "border-emerald-500/40 bg-emerald-500/15 text-emerald-300", className)}><Check /></span>;
    case "running":
      return <span className={cn(base, "border-violet-500/50 bg-violet-500/15 text-violet-300", className)}><Loader2 className="animate-spin" /></span>;
    case "failed":
      return <span className={cn(base, "border-red-500/40 bg-red-500/15 text-red-300", className)}><X /></span>;
    case "skipped":
      return <span className={cn(base, "border-amber-500/30 bg-amber-500/10 text-amber-300", className)}><Minus /></span>;
    default:
      return <span className={cn(base, "border-line bg-panel-2", className)}><span className="size-1.5 rounded-full bg-muted/50" /></span>;
  }
}
