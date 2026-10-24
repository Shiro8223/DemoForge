"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Plug, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Status = { configured: false } | { configured: true; source: "settings" | "env"; hint: string; url: string };
type TestResult = { ok: boolean; error?: string; tools?: string[]; videoTool?: string | null; statusTool?: string | null };

export function HiggsfieldSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
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
    const res = await fetch("/api/settings/higgsfield/test", { method: "POST" });
    setTest(await res.json());
    setBusy(null);
  }

  async function clear() {
    setBusy("clear");
    await fetch("/api/settings/higgsfield", { method: "DELETE" });
    setBusy(null);
    setTest(null);
    load();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><Plug className="size-4 text-violet-300" /> Higgsfield MCP</CardTitle>
          {status?.configured ? (
            <Badge variant="success">Connected · {status.source === "env" ? "from .env" : "saved"} · {status.hint}</Badge>
          ) : (
            <Badge variant="warning">Not configured</Badge>
          )}
        </div>
        <CardDescription>
          Used to generate the cinematic hook, transition and closing scenes. Your token is stored server-side only (never in the browser) and is never
          shown to repository code. Without it, DemoForge renders those scenes locally as motion-graphics title cards.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={save} className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted">Access token</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your Higgsfield token" className="pl-9 font-mono" autoComplete="off" />
            </div>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted">MCP server URL (optional)</span>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={status?.configured ? status.url : "https://mcp.higgsfield.ai/mcp"} className="font-mono" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!token || busy !== null}>{busy === "save" && <Loader2 className="animate-spin" />} Save token</Button>
            <Button type="button" variant="secondary" onClick={runTest} disabled={!status?.configured || busy !== null}>
              {busy === "test" && <Loader2 className="animate-spin" />} Test connection
            </Button>
            {status?.configured && status.source === "settings" && (
              <Button type="button" variant="destructive" onClick={clear} disabled={busy !== null}><Trash2 /> Remove</Button>
            )}
          </div>
          {message && <p className="text-sm text-muted">{message}</p>}
        </form>

        {test && (
          <div className={`rounded-xl border p-4 text-sm ${test.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
            {test.ok ? (
              <>
                <p className="flex items-center gap-2 font-medium text-emerald-300"><CheckCircle2 className="size-4" /> Connected — {test.tools?.length} tools available</p>
                <p className="mt-2 text-muted">Video tool: <code className="font-mono text-fg">{test.videoTool ?? "none found"}</code> · Status tool: <code className="font-mono text-fg">{test.statusTool ?? "none found"}</code></p>
                <p className="mt-2 font-mono text-xs break-words text-muted">{test.tools?.join(", ")}</p>
              </>
            ) : (
              <p className="text-red-200">{test.error}</p>
            )}
          </div>
        )}
        <p className="text-xs text-muted">
          Hackathon note: the token is kept in <code className="font-mono">data/secrets/higgsfield.json</code> (mode 600) on the worker host. It isn&apos;t encrypted at rest, so use a token you can revoke.
        </p>
      </CardContent>
    </Card>
  );
}
