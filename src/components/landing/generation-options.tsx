"use client";

import Link from "next/link";
import { AudioLines, Clock, Clapperboard, MessageSquareText, Palette, RectangleHorizontal, RectangleVertical, Sparkles } from "lucide-react";
import { FILTERS, LIMITS, maxScenesFor, type GenerationSettings, type VideoFilter } from "@/lib/validation/schemas";
import { cn } from "@/lib/utils";

const FILTER_INFO: Record<VideoFilter, { label: string; css: string }> = {
  none: { label: "None", css: "none" },
  cinematic: { label: "Cinematic", css: "contrast(1.15) saturate(0.85) sepia(0.15) hue-rotate(-8deg)" },
  noir: { label: "Noir", css: "grayscale(1) contrast(1.35)" },
  vintage: { label: "Vintage", css: "sepia(0.55) saturate(0.8) contrast(0.95)" },
  vivid: { label: "Vivid", css: "saturate(1.7) contrast(1.1)" },
  warm: { label: "Warm", css: "sepia(0.3) saturate(1.3) hue-rotate(-12deg)" },
  cool: { label: "Cool", css: "hue-rotate(18deg) saturate(0.95) brightness(1.05)" },
};

/** The same colourful swatch under each filter's CSS approximation, so the tiles preview the look. */
const SWATCH = "linear-gradient(135deg, #ff7ac0 0 33%, #ffd93d 33% 66%, #5aa9ff 66%)";

function Section({ icon: Icon, label, value, children }: { icon: typeof Clock; label: string; value?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-bold text-black">
          <Icon className="size-4" /> {label}
        </p>
        {value}
      </div>
      {children}
    </div>
  );
}

const Chip = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn("rounded-lg border-2 border-black px-2 py-0.5 font-display text-lg leading-tight normal-case text-black", className)}>{children}</span>
);

function Slider(props: { label: string; min: number; max: number; value: number; onChange: (v: number) => void; color: string }) {
  const fill = props.max === props.min ? 100 : ((props.value - props.min) / (props.max - props.min)) * 100;
  return (
    <input
      type="range"
      aria-label={props.label}
      min={props.min}
      max={props.max}
      step={1}
      value={props.value}
      onChange={(e) => props.onChange(Number(e.target.value))}
      className="brutal-range"
      style={{ "--fill": `${fill}%`, "--range-color": props.color } as React.CSSProperties}
    />
  );
}

/** Pre-generation options shown under the URL field once a repository is chosen. */
export type HiggsfieldInfo = { mode: "api" | "mcp" | "off"; maxScenes: number };

const INSTRUCTION_IDEAS = "e.g. Hype trailer energy, lean into the real-time board, end on our hackathon win. Neon city at night for the AI shots.";

export function GenerationOptions({
  value,
  onChange,
  voiceAvailable,
  higgsfield,
}: {
  value: GenerationSettings;
  onChange: (v: GenerationSettings) => void;
  voiceAvailable: boolean;
  higgsfield: HiggsfieldInfo | null;
}) {
  const set = (patch: Partial<GenerationSettings>) => {
    const next = { ...value, ...patch };
    next.sceneCount = Math.min(next.sceneCount, maxScenesFor(next.duration));
    onChange(next);
  };
  const maxScenes = maxScenesFor(value.duration);
  const perScene = (value.duration / value.sceneCount).toFixed(1);

  return (
    <section aria-label="Video options" className="mt-6 rounded-2xl border-3 border-black bg-white p-5 text-left shadow-brutal">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-2xl">Video options</h2>
        <span className="rounded-full border-2 border-black bg-pop-green px-2.5 py-0.5 text-[11px] font-bold">Set before generating</span>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section icon={RectangleVertical} label="Aspect ratio">
          <div role="radiogroup" aria-label="Aspect ratio" className="grid grid-cols-2 gap-2.5">
            {(
              [
                { id: "9:16", name: "Vertical", hint: "Reels · TikTok · Shorts", Icon: RectangleVertical },
                { id: "16:9", name: "Widescreen", hint: "YouTube · X · decks", Icon: RectangleHorizontal },
              ] as const
            ).map(({ id, name, hint, Icon }) => {
              const on = value.aspectRatio === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ aspectRatio: id })}
                  className={cn(
                    "brutal-press flex flex-col items-start gap-1 rounded-xl border-3 border-black p-3 text-left",
                    on ? "bg-pop-pink shadow-brutal-sm" : "bg-white",
                  )}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="font-display text-2xl leading-none">{id}</span>
                    <Icon className="size-6" />
                  </span>
                  <span className="text-[13px] font-bold">{name}</span>
                  <span className="text-[11px] text-black/70">{hint}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <div className="space-y-6">
          <Section icon={Clock} label="Video length" value={<Chip className="bg-pop-yellow">{value.duration}s</Chip>}>
            <Slider label="Video length in seconds" min={LIMITS.minDuration} max={LIMITS.maxDuration} value={value.duration} onChange={(d) => set({ duration: d })} color="var(--color-pop-yellow)" />
            <div className="mt-1.5 flex justify-between text-[11px] font-bold text-black/60">
              <span>{LIMITS.minDuration}s</span>
              <span>{LIMITS.maxDuration}s max</span>
            </div>
          </Section>

          <Section icon={Clapperboard} label="Scenes" value={<Chip className="bg-pop-cyan">{value.sceneCount}</Chip>}>
            <Slider label="Number of scenes" min={LIMITS.minScenes} max={maxScenes} value={value.sceneCount} onChange={(n) => set({ sceneCount: n })} color="var(--color-pop-cyan)" />
            <p className="mt-1.5 text-[11px] font-bold text-black/60">
              About {perScene}s each · up to {maxScenes} at {value.duration}s
            </p>
          </Section>
        </div>
      </div>

      <div className="mt-6">
        <Section icon={Palette} label="Filter" value={<span className="text-[11px] font-bold text-black/60">Graded onto the final cut</span>}>
          <div role="radiogroup" aria-label="Filter" className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {FILTERS.map((f) => {
              const on = value.filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ filter: f })}
                  className={cn(
                    "brutal-press flex flex-col items-center gap-1.5 rounded-xl border-3 border-black p-1.5 pb-1",
                    on ? "bg-pop-yellow shadow-brutal-sm" : "bg-white",
                  )}
                >
                  <span className="block aspect-square w-full rounded-md border-2 border-black" style={{ background: SWATCH, filter: FILTER_INFO[f].css }} />
                  <span className="text-[11px] font-bold">{FILTER_INFO[f].label}</span>
                </button>
              );
            })}
          </div>
        </Section>
      </div>

      <div className="mt-6">
        <Section
          icon={MessageSquareText}
          label="Custom instructions"
          value={<span className="text-[11px] font-bold text-black/60">Optional · {value.instructions.length}/1000</span>}
        >
          <textarea
            value={value.instructions}
            maxLength={1000}
            rows={3}
            onChange={(e) => set({ instructions: e.target.value })}
            placeholder={INSTRUCTION_IDEAS}
            aria-label="Custom instructions for this video"
            className="w-full resize-y rounded-xl border-3 border-black bg-white px-3 py-2.5 text-sm text-fg placeholder:text-black/40 focus-visible:bg-pop-yellow/20 focus-visible:shadow-brutal-sm focus-visible:outline-none"
          />
          <p className="mt-1.5 text-[11px] font-bold text-black/60">Steers the storyboard, captions and every Higgsfield shot.</p>
        </Section>
      </div>

      {higgsfield && (
        <div className={cn("mt-6 flex items-start gap-3 rounded-xl border-3 border-black p-3.5", higgsfield.mode === "off" ? "bg-panel-2" : "bg-pop-purple")}>
          <Sparkles className="mt-0.5 size-5 shrink-0" />
          <div className="text-[13px] text-black">
            {higgsfield.mode === "api" ? (
              <>
                <p className="font-bold">
                  Higgsfield animates {Math.min(value.sceneCount, higgsfield.maxScenes)} of {value.sceneCount} scenes
                </p>
                <p className="mt-0.5 text-[12px] text-black/75">
                  Real screenshots come alive with image-to-video; hook and closing shots are generated. Each animated scene uses Higgsfield credits.
                  {higgsfield.maxScenes < value.sceneCount && " Raise HIGGSFIELD_MAX_SCENES to animate them all."}
                </p>
              </>
            ) : higgsfield.mode === "mcp" ? (
              <p className="font-bold">Higgsfield (MCP) animates the generated scenes. Add HF_CREDENTIALS to also animate the real screenshots.</p>
            ) : (
              <p className="font-bold">
                Higgsfield isn&apos;t connected, so scenes use local motion.{" "}
                <Link href="/settings" className="underline decoration-2 underline-offset-2">Set it up</Link>
              </p>
            )}
          </div>
        </div>
      )}

      <div className={cn("mt-6 flex items-center justify-between gap-4 rounded-xl border-3 border-black p-3.5", value.voiceover ? "bg-pop-orange" : "bg-panel-2")}>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-black">
            <AudioLines className="size-4" /> Voiceover <span className="font-medium text-black/70">· ElevenLabs</span>
          </p>
          <p className="mt-0.5 text-[12px] text-black/75">
            {voiceAvailable ? (
              "A narrator reads one line per scene, over the music."
            ) : (
              <>
                Add <code className="font-mono">ELEVENLABS_API_KEY</code> to enable.{" "}
                <Link href="/settings#voiceover" className="font-bold underline decoration-2 underline-offset-2">
                  How
                </Link>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.voiceover}
          aria-label="Voiceover"
          disabled={!voiceAvailable}
          onClick={() => set({ voiceover: !value.voiceover })}
          className={cn(
            "relative h-8 w-14 shrink-0 rounded-full border-3 border-black transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            value.voiceover ? "bg-black" : "bg-white",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-md border-2 border-black transition-all",
              value.voiceover ? "left-[26px] bg-pop-yellow" : "left-0.5 bg-pop-pink",
            )}
          />
        </button>
      </div>
    </section>
  );
}
