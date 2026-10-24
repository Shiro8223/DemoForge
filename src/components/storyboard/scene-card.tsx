"use client";

import { useState } from "react";
import { Image as ImageIcon, Loader2, Pencil, Sparkles, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { GeneratedScene, Scene } from "@/types";

const TRANSITIONS = ["fade", "cut", "slideleft", "slideup", "circleopen", "dissolve", "zoomin"] as const;

export function SceneCard(props: {
  jobId: string;
  scene: Scene;
  index: number;
  generated?: GeneratedScene;
  editable: boolean;
  higgsfield: boolean;
  onQueued: () => void;
}) {
  const { jobId, scene, index, generated, editable, higgsfield, onQueued } = props;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(scene.textOverlay);
  const [duration, setDuration] = useState(String(scene.duration));
  const [transition, setTransition] = useState(scene.transition);
  const [prompt, setPrompt] = useState(scene.videoPrompt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(regenerate: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}/scenes/${scene.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textOverlay: text, duration: Number(duration), transition, videoPrompt: prompt, regenerate }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not save");
    setEditing(false);
    onQueued();
  }

  const thumb = scene.screenshot ? `/api/jobs/${jobId}/files/${scene.screenshot}` : null;
  const source = (
    <Badge variant={scene.visualType === "screenshot" ? "default" : "accent"} className="text-[10px]">
      {scene.visualType === "screenshot" ? <ImageIcon /> : <Sparkles />}
      {scene.visualType === "screenshot" ? "Screenshot" : generated ? "AI · Higgsfield" : "Title card"}
    </Badge>
  );
  const media = (
    <div className="relative aspect-[9/16] overflow-hidden bg-gradient-to-br from-violet-900/60 via-panel-2 to-cyan-900/40">
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="size-full object-cover object-top" />
      ) : (
        <div className="grid size-full place-items-center px-2 text-center font-display text-[11px] leading-tight font-bold text-white/90">
          {scene.textOverlay}
        </div>
      )}
      <span className="absolute top-1.5 left-1.5 rounded-md bg-black/60 px-1.5 font-mono text-[10px] text-white">{String(index + 1).padStart(2, "0")}</span>
      <span className="absolute top-1.5 right-1.5 rounded-md bg-black/60 px-1.5 font-mono text-[10px] text-white">{scene.duration}s</span>
    </div>
  );

  if (!editing)
    return (
      <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel-2">
        {media}
        <div className="flex flex-1 flex-col gap-2 p-2.5">
          <p className="truncate text-xs font-semibold" title={scene.title}>{scene.title}</p>
          <div>{source}</div>
          <p className="line-clamp-2 text-[11px] text-fg/80" title={`${scene.purpose} — ${scene.visualDescription}`}>“{scene.textOverlay}”</p>
          <span className="font-mono text-[10px] text-muted">{scene.transition}</span>
          {editable && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-auto inline-flex items-center gap-1 self-start text-[11px] text-muted transition-colors hover:text-fg"
            >
              <Pencil className="size-3" /> Edit
            </button>
          )}
        </div>
      </div>
    );

  return (
    <div className="col-span-full flex gap-4 rounded-2xl border border-violet-500/30 bg-panel-2 p-3">
      <div className="w-24 shrink-0 overflow-hidden rounded-xl border border-line">{media}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{scene.title}</p>
          {source}
        </div>
        <p className="mt-1 text-xs text-muted">{scene.purpose} — {scene.visualDescription}</p>
        <div className="mt-3 grid gap-2">
          <label className="grid gap-1 text-xs text-muted">
            On-screen text
            <Input value={text} maxLength={80} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-muted">
              Duration (s)
              <Input type="number" min={1.5} max={10} step={0.5} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-muted">
              Transition in
              <select
                value={transition}
                onChange={(e) => setTransition(e.target.value as Scene["transition"])}
                className="h-10 rounded-xl border border-line bg-panel px-3 text-sm text-fg focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
              >
                {TRANSITIONS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          </div>
          {scene.visualType === "generated" && (
            <label className="grid gap-1 text-xs text-muted">
              Video prompt
              <Textarea rows={3} value={prompt} maxLength={600} onChange={(e) => setPrompt(e.target.value)} />
            </label>
          )}
          {error && <p className="text-xs text-red-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => save(false)}>
              {busy && <Loader2 className="animate-spin" />} Save & re-render
            </Button>
            {scene.visualType === "generated" && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !higgsfield}
                title={higgsfield ? undefined : "Connect Higgsfield in Settings first"}
                onClick={() => save(true)}
              >
                <Wand2 /> Regenerate scene
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
