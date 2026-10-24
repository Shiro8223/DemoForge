import { Check, Loader2, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobStatus, StageStatus } from "@/types";

export function StatusDot({ status, className }: { status: StageStatus | JobStatus; className?: string }) {
  const base = "grid size-7 shrink-0 place-items-center rounded-full border-2 border-black text-black [&_svg]:size-4";
  switch (status) {
    case "completed":
      return <span className={cn(base, "bg-pop-green", className)}><Check /></span>;
    case "running":
      return <span className={cn(base, "bg-pop-blue", className)}><Loader2 className="animate-spin" /></span>;
    case "failed":
      return <span className={cn(base, "bg-pop-red", className)}><X /></span>;
    case "skipped":
      return <span className={cn(base, "bg-pop-yellow", className)}><Minus /></span>;
    default:
      return <span className={cn(base, "bg-white", className)}><span className="size-1.5 rounded-full bg-black/40" /></span>;
  }
}
