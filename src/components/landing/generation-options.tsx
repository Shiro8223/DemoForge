"use client";

import Link from "next/link";
import { AudioLines, Blend, Clock, Clapperboard, MessageSquareText, Move, Palette, RectangleHorizontal, RectangleVertical } from "lucide-react";
import {
  FILTERS,
  LIMITS,
  maxScenesFor,
  MOTIONS,
  RECOMMENDED_HIGGSFIELD_PROMPT,
  VOICE_TONES,
  VOICES,
  type GenerationSettings,
  type MotionStyle,
  type VideoFilter,
  type VoiceTone,
} from "@/lib/validation/schemas";
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

const MOTION_INFO: Record<MotionStyle, { label: string; hint: string }> = {
  glide: { label: "Glide", hint: "Smooth, steady drift" },
  zoom: { label: "Zooms", hint: "Punchy zoom-ins" },
  dramatic: { label: "Dramatic", hint: "Slow trailer push" },
};

const TONE_INFO: Record<VoiceTone, string> = { friendly: "Friendly", hype: "Hype", calm: "Calm", epic: "Epic" };

/** Compact single-choice row: used for camera, voice and tone so the panel stays tidy. */
function Pills<T extends string>(props: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; render: (v: T) => React.ReactNode; on: string }) {
  return (
    <div role="radiogroup" aria-label={props.label} className="flex flex-wrap gap-1.5">
      {props.options.map((o) => (
        <button
          key={o || "default"}
          type="button"
          role="radio"
          aria-checked={props.value === o}
          onClick={() => props.onChange(o)}
          className={cn("brutal-press rounded-lg border-2 border-black px-2.5 py-1 text-left text-[12px] font-bold text-black", props.value === o ? `${props.on} shadow-brutal-sm` : "bg-white")}
        >
          {props.render(o)}
        </button>
      ))}
    </div>
  );
}

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

/** Brutalist on/off switch. */
function Switch({ on, label, disabled, onToggle }: { on: boolean; label: string; disabled?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-8 w-14 shrink-0 rounded-full border-3 border-black transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        on ? "bg-black" : "bg-white",
      )}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-md border-2 border-black transition-all", on ? "left-[26px] bg-pop-yellow" : "left-0.5 bg-pop-pink")} />
    </button>
  );
}

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
        <Section icon={Move} label="Camera" value={<span className="text-[11px] font-bold text-black/60">How the screenshots move</span>}>
          <div role="radiogroup" aria-label="Camera" className="grid grid-cols-3 gap-2">
            {MOTIONS.map((m) => {
              const on = (value.motion ?? "glide") === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ motion: m })}
                  className={cn("brutal-press rounded-xl border-3 border-black px-3 py-2 text-left", on ? "bg-pop-cyan shadow-brutal-sm" : "bg-white")}
                >
                  <span className="block text-[13px] font-bold">{MOTION_INFO[m].label}</span>
                  <span className="block text-[11px] text-black/70">{MOTION_INFO[m].hint}</span>
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
            onKeyDown={(e) => {
              // Tab in an empty field accepts the greyed-out suggestion; otherwise Tab moves focus as usual.
              if (e.key === "Tab" && !e.shiftKey && !value.instructions.trim()) {
                e.preventDefault();
                set({ instructions: RECOMMENDED_HIGGSFIELD_PROMPT });
              }
            }}
            placeholder={RECOMMENDED_HIGGSFIELD_PROMPT}
            aria-label="Custom instructions for this video"
            className="w-full resize-y rounded-xl border-3 border-black bg-white px-3 py-2.5 text-sm text-fg placeholder:text-black/40 focus-visible:bg-pop-yellow/20 focus-visible:shadow-brutal-sm focus-visible:outline-none"
          />
          <p className="mt-1.5 text-[11px] font-bold text-black/60">
            Steers the storyboard, captions and every Higgsfield shot.
            {!value.instructions.trim() && (
              <>
                {" "}Press <kbd className="rounded border-2 border-black bg-white px-1 font-mono text-[10px] text-black">Tab</kbd> to use the suggestion.
              </>
            )}
          </p>
        </Section>
        {higgsfield?.mode === "api" && (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border-3 border-black bg-pop-purple/25 p-3.5">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-bold text-black">
                <Blend className="size-4" /> Blend screenshots
              </p>
              <p className="mt-0.5 text-[12px] text-black/75">
                Each screenshot flows into the next, so the app tour plays as one continuous take.
              </p>
            </div>
            <Switch on={value.blendShots} label="Blend screenshots" onToggle={() => set({ blendShots: !value.blendShots })} />
          </div>
        )}
      </div>

      <div className={cn("mt-6 rounded-xl border-3 border-black p-3.5", value.voiceover ? "bg-pop-orange" : "bg-panel-2")}>
        <div className="flex items-center justify-between gap-4">
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
          <Switch on={value.voiceover} label="Voiceover" disabled={!voiceAvailable} onToggle={() => set({ voiceover: !value.voiceover })} />
        </div>
        {value.voiceover && (
          // Only while narration is on, so the panel stays short otherwise.
          <div className="mt-3.5 grid gap-3 border-t-2 border-black/20 pt-3.5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-x-4">
            <span className="text-[12px] font-bold text-black">Voice</span>
            <Pills
              label="Voice"
              options={VOICES.map((v) => v.id)}
              value={value.voiceId ?? ""}
              onChange={(id) => set({ voiceId: id })}
              on="bg-pop-yellow"
              render={(id) => {
                const v = VOICES.find((x) => x.id === id)!;
                return (
                  <>
                    {v.name} <span className="font-medium text-black/60">· {v.hint}</span>
                  </>
                );
              }}
            />
            <span className="text-[12px] font-bold text-black">Tone</span>
            <Pills label="Tone" options={VOICE_TONES} value={value.voiceTone ?? "friendly"} onChange={(t) => set({ voiceTone: t })} on="bg-pop-yellow" render={(t) => TONE_INFO[t]} />
          </div>
        )}
      </div>
    </section>
  );
}
