"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Lock, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Repo = { fullName: string; private: boolean; description: string | null; pushedAt: string | null };

function ago(iso: string | null) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Searchable dropdown of the signed-in user's GitHub repos (private included). Loads on first open. */
export function RepoPicker({ onSelect }: { onSelect: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open || repos || error) return;
    fetch("/api/github/repos", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load repositories.");
        setRepos(d.repos);
      })
      .catch((e: Error) => setError(e.message));
  }, [open, repos, error]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (repos ?? []).filter((r) => !q || r.fullName.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q));
  }, [repos, query]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(r: Repo) {
    onSelect(`https://github.com/${r.fullName}`);
    setOpen(false);
    setQuery("");
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") (e.preventDefault(), setActive((i) => Math.min(i + 1, shown.length - 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((i) => Math.max(i - 1, 0)));
    else if (e.key === "Enter" && shown[active]) (e.preventDefault(), pick(shown[active]));
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Choose one of your repositories"
        title="Your repositories"
        className="grid size-12 place-items-center rounded-xl border-3 border-black bg-pop-cyan text-black transition-colors duration-150 hover:bg-pop-yellow"
      >
        <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-[calc(100vw-2rem)] max-w-[420px] overflow-hidden rounded-xl border-3 border-black bg-white shadow-brutal">
          <label className="flex items-center gap-2 border-b-3 border-black px-3.5">
            <Search className="size-4 shrink-0 text-muted" />
            <span className="sr-only">Search your repositories</span>
            <input
              autoFocus
              value={query}
              onChange={(e) => (setQuery(e.target.value), setActive(0))}
              onKeyDown={onKey}
              placeholder="Search your repositories"
              className="h-11 w-full bg-transparent text-sm text-fg focus:outline-none"
            />
          </label>
          {error ? (
            <p className="px-3.5 py-4 text-[13px] font-bold text-red-700">{error}</p>
          ) : !repos ? (
            <p className="flex items-center gap-2 px-3.5 py-4 text-[13px] text-muted">
              <Loader2 className="size-4 animate-spin" /> Loading repositories…
            </p>
          ) : shown.length === 0 ? (
            <p className="px-3.5 py-4 text-[13px] text-muted">No repositories match.</p>
          ) : (
            <ul ref={list} role="listbox" className="max-h-80 overflow-y-auto py-1">
              {shown.map((r, i) => (
                <li key={r.fullName} data-index={i} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    onMouseEnter={() => setActive(i)}
                    className={cn("flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left", i === active && "bg-pop-yellow")}
                  >
                    <span className="mt-0.5 w-3.5 shrink-0">{r.private && <Lock className="size-3.5 text-black" aria-label="Private" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13px] text-fg">{r.fullName}</span>
                      {r.description && <span className="mt-0.5 block truncate text-xs text-muted">{r.description}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{ago(r.pushedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
