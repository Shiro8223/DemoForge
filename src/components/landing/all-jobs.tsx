"use client";

import Link from "next/link";
import { Film, Loader2, Plus } from "lucide-react";
import { JobGrid, useJobs } from "@/components/landing/recent-jobs";

export function AllJobs() {
  const rows = useJobs(200);
  if (!rows) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-7 animate-spin text-black" />
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center rounded-2xl border-3 border-black bg-white px-6 py-16 text-center shadow-brutal">
        <span className="mb-4 grid size-12 place-items-center rounded-xl border-3 border-black bg-pop-purple text-black">
          <Film className="size-[18px]" />
        </span>
        <h2 className="text-lg">No jobs yet</h2>
        <p className="mt-1.5 mb-6 text-[13px] text-muted">Paste a GitHub repo to generate your first demo.</p>
        <Link
          href="/#import"
          className="brutal-press flex h-10 items-center gap-1.5 rounded-xl border-3 border-black bg-pop-pink px-4 text-sm font-bold text-black shadow-brutal-sm"
        >
          <Plus className="size-4" /> New demo
        </Link>
      </div>
    );
  }
  return <JobGrid rows={rows} />;
}
