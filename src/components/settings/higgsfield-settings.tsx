"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Eye, EyeOff, KeyRound, Link2, Loader2, Plug, Save, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = { configured: false } | { configured: true; source: "settings" | "env"; hint: string; url: string };
type TestResult = { ok: boolean; error?: string; tools?: string[]; videoTool?: string | null; statusTool?: string | null; ms?: number };

const DEFAULT_URL = "https://mcp.higgsfield.ai/mcp";

/** Higgsfield integration card plus the danger zone, which shares its key state; `children` render between them. */
export function HiggsfieldSettings({ maxScenes, children }: { maxScenes: number; children?: React.ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [reveal, setReveal] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "clear" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);

  const load = () => fetch("/api/settings/higgsfield").then((r) => r.json()).then(setStatus);
  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setMessage(null);
    const res = await fetch("/api/settings/higgsfield", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, url: url || undefined }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) return setMessage(data.error);
    setToken("");
    setMessage("Saved on the server.");
    load();
  }

  async function runTest() {
    setBusy("test");
    setTest(null);
    const started = performance.now();
    const res = await fetch("/api/settings/higgsfield/test", { method: "POST" });
    setTest({ ...(await res.json()), ms: Math.round(performance.now() - started) });
    setBusy(null);
  }

  async function clear() {
    setBusy("clear");
    await fetch("/api/settings/higgsfield", { method: "DELETE" });
    setBusy(null);
    setTest(null);
    load();
  }

  const removable = status?.configured && status.source === "settings";

  return (
    <>
      <section id="integrations" className="scroll-mt-20 overflow-hidden rounded-2xl border-3 border-black bg-white shadow-brutal">
        <div className="p-5 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 -rotate-6 place-items-center rounded-xl border-3 border-black bg-pop-purple text-black">
                <Sparkles className="size-[18px]" />
              </span>
              <div>
                <h2 className="text-xl">Higgsfield MCP</h2>
                <p className="mt-0.5 text-[13px] text-muted">Cinematic scene generation</p>
              </div>
            </div>
            {status?.configured ? (
              <Badge variant="success">
                <span className="size-1.5 rounded-full bg-black" /> Connected · {status.source === "env" ? "from .env" : "saved"} · {status.hint}
              </Badge>
            ) : (
              <Badge variant="warning"><span className="size-1.5 rounded-full bg-black" /> Not configured</Badge>
            )}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Used to generate the cinematic hook, transition and closing scenes around real product screenshots. Your token is stored server-side only
            and is never shown to repository code. Without it, those scenes render locally as motion-graphics title cards.
          </p>
        </div>

        <form onSubmit={save} className="space-y-4 p-5 pt-2">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted">Access token</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
              <Input
                type={reveal ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your Higgsfield token"
                className="h-11 pr-10 pl-10 font-mono"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? "Hide token" : "Show token"}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted transition-colors hover:text-fg"
              >
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <span className="font-mono text-xs text-muted">Stored server-side in data/secrets/</span>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted">MCP server URL (optional)</span>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={status?.configured ? status.url : DEFAULT_URL}
              className="font-mono"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!token || busy !== null}>
              {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save key
            </Button>
            <Button type="button" variant="secondary" onClick={runTest} disabled={!status?.configured || busy !== null}>
              {busy === "test" ? <Loader2 className="animate-spin" /> : <Plug />} Test connection
            </Button>
          </div>
          {message && <p className="text-sm text-muted">{message}</p>}

          {test &&
            (test.ok ? (
              <div className="rounded-xl border-3 border-black bg-pop-green/30 px-4 py-3 text-[13px]">
                <p className="flex items-center gap-2 font-bold text-black">
                  <CircleCheck className="size-4 shrink-0" /> Connection OK · <span className="font-mono">{test.tools?.length} tools discovered</span> ·{" "}
                  <span className="font-mono">{test.ms}ms</span>
                </p>
                <p className="mt-2 text-muted">
                  Video tool: <code className="font-mono text-fg">{test.videoTool ?? "none found"}</code> · Status tool:{" "}
                  <code className="font-mono text-fg">{test.statusTool ?? "none found"}</code>
                </p>
                <p className="mt-2 font-mono text-xs break-words text-muted">{test.tools?.join(", ")}</p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-xl border-3 border-black bg-pop-red/25 px-4 py-3 text-[13px] text-black">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-black" /> {test.error}
              </div>
            ))}
          <p className="text-xs text-muted">
            Hackathon note: the token is kept in <code className="font-mono">data/secrets/higgsfield.json</code> (mode 600) on the worker host. It
            isn&apos;t encrypted at rest, so use a token you can revoke.
          </p>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 text-xs">
          <div className="flex min-w-0 items-center gap-2 text-muted">
            <Link2 className="size-3.5 shrink-0" />
            <span className="truncate font-mono text-fg">{status?.configured ? status.url : DEFAULT_URL}</span>
          </div>
          <span className="text-muted">
            Max scenes per video: <span className="font-mono text-fg">{maxScenes}</span>
          </span>
        </div>
      </section>

      {children}

      <section id="danger" className="scroll-mt-20 rounded-2xl border-3 border-black bg-pop-red/15 p-5 shadow-brutal">
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-5 text-black" />
          <h2 className="text-xl text-black">Danger zone</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Removing the Higgsfield key falls back to local motion-graphics title cards for cinematic scenes.
          {status?.configured && status.source === "env" && " This key comes from .env, so remove HIGGSFIELD_API_KEY there instead."}
        </p>
        <Button variant="destructive" className="mt-4" onClick={clear} disabled={!removable || busy !== null}>
          {busy === "clear" ? <Loader2 className="animate-spin" /> : <Trash2 />} Remove Higgsfield key
        </Button>
      </section>
    </>
  );
}
