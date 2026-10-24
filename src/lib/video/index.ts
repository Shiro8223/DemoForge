import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { config } from "@/lib/config";
import type { Scene, Storyboard } from "@/lib/validation/schemas";

/**
 * FFmpeg assembly. Every scene is rendered to a normalised 1080x1920 / 30fps / yuv420p
 * clip, then clips are joined with xfade transitions and mixed with music (and an ElevenLabs
 * voiceover when one was recorded, with the music ducked underneath).
 * All arguments are passed as argv (never through a shell) and overlay text is
 * written to files consumed via drawtext's `textfile=`, so no escaping issues.
 */

export const W = 1080;
export const H = 1920;
export const FPS = 30;
const XFADE = 0.5;

const FONT_BOLD = () => path.join(config.fontsDir, "InterDisplay-Bold.otf");
const FONT_MED = () => path.join(config.fontsDir, "Inter-Medium.otf");
const FONT_MONO = () => path.join(config.fontsDir, "JetBrainsMono-Regular.ttf");

async function ffmpeg(args: string[], timeout = 5 * 60_000) {
  const r = await execa(config.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { timeout, reject: false, all: true });
  if (r.exitCode !== 0) throw new Error(`ffmpeg failed: ${(r.all ?? "").slice(-1200)}`);
}

export async function probeDuration(file: string): Promise<number> {
  const r = await execa(config.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { reject: false });
  const d = parseFloat(r.stdout);
  if (r.exitCode !== 0 || Number.isNaN(d)) throw new Error(`Not a readable media file: ${path.basename(file)}`);
  return d;
}

export async function probeHasVideo(file: string): Promise<boolean> {
  const r = await execa(config.ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file], { reject: false });
  return r.exitCode === 0 && r.stdout.trim() === "video";
}

/** Greedy word wrap for drawtext (which doesn't wrap). */
export function wrapText(text: string, maxChars: number, maxLines = 3): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[.,;:!?]?$/, "…");
    return kept;
  }
  return lines;
}

/** Escapes a path for use inside an ffmpeg filtergraph option value. */
const fp = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

/** drawtext filters for centred multi-line text with a fade-in, one filter per line. */
async function textFilters(opts: {
  text: string;
  dir: string;
  key: string;
  font: string;
  size: number;
  centerY: number;
  maxChars: number;
  appearAt?: number;
  maxLines?: number;
  color?: string;
  shadow?: boolean;
}): Promise<string[]> {
  const lines = wrapText(opts.text, opts.maxChars, opts.maxLines ?? 3);
  const lh = Math.round(opts.size * 1.18);
  const top = Math.round(opts.centerY - (lines.length * lh) / 2);
  const t0 = opts.appearAt ?? 0.25;
  const filters: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const file = path.join(opts.dir, `${opts.key}-${i}.txt`);
    await fs.writeFile(file, lines[i]);
    const delay = t0 + i * 0.12;
    // Fade + 24px rise over 0.5s.
    const alpha = `if(lt(t,${delay}),0,if(lt(t,${delay + 0.5}),(t-${delay})/0.5,1))`;
    const y = `${top + i * lh}+24*(1-min(1,max(0,(t-${delay})/0.5)))`;
    filters.push(
      `drawtext=fontfile='${fp(opts.font)}':textfile='${fp(file)}':fontsize=${opts.size}:fontcolor=${opts.color ?? "white"}` +
        `:x=(w-text_w)/2:y='${y}':alpha='${alpha}'` +
        (opts.shadow === false ? "" : ":shadowcolor=black@0.55:shadowx=0:shadowy=6"),
    );
  }
  return filters;
}

const ENCODE = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", String(FPS)];

/** Real screenshot inside a rounded "device card" over a blurred copy of itself, with a slow push-in. */
async function renderScreenshotScene(scene: Scene, shotFile: string, out: string, tmp: string) {
  const still = path.join(tmp, `${scene.id}-still.png`);
  const cardW = 900;
  const cardH = 1360;
  const cardY = 440;
  const r = 44;
  // Rounded-corner alpha mask computed once on a single frame.
  const mask =
    `geq=lum='p(X,Y)':a='if(gt(abs(X-W/2),W/2-${r})*gt(abs(Y-H/2),H/2-${r}),` +
    `if(lte(hypot(abs(X-W/2)-(W/2-${r}),abs(Y-H/2)-(H/2-${r})),${r}),255,0),255)'`;
  await ffmpeg([
    "-i", shotFile,
    "-filter_complex",
    [
      `[0]split[a][b]`,
      `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:3,eq=brightness=-0.32:saturation=1.25[bg]`,
      `[b]scale=${cardW}:-2,crop=${cardW}:'min(ih,${cardH})':0:0,format=yuva420p,${mask}[card]`,
      `[card]split=3[c1][c2][c3]`,
      `[c2]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.6,boxblur=24:2[shadow]`,
      // Hairline rim so dark UIs don't dissolve into the dark background.
      `[c3]format=rgba,lutrgb=r=255:g=255:b=255:a='val*0.22',scale=iw+6:ih+6[rim]`,
      `[bg][shadow]overlay=(W-w)/2:${cardY + 28}[bg2]`,
      `[bg2][rim]overlay=(W-w)/2:${cardY - 3}[bg3]`,
      `[bg3][c1]overlay=(W-w)/2:${cardY}:format=auto,format=rgb24`,
    ].join(";"),
    "-frames:v", "1", still,
  ]);

  const frames = Math.round(scene.duration * FPS);
  const text = await textFilters({ text: scene.textOverlay, dir: tmp, key: scene.id, font: FONT_BOLD(), size: 76, centerY: 250, maxChars: 20 });
  await ffmpeg([
    "-loop", "1", "-framerate", String(FPS), "-i", still,
    "-filter_complex",
    [
      // Upscale first so zoompan's integer rounding doesn't cause visible jitter.
      `[0]scale=${W * 2}:${H * 2},zoompan=z='1+0.05*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`,
      ...text,
    ].join(","),
    "-frames:v", String(frames), ...ENCODE, "-an", out,
  ]);
}

/** Locally rendered motion-graphics card. Used for generated scenes when Higgsfield is unavailable. */
async function renderTitleScene(scene: Scene, out: string, tmp: string, opts: { footer?: string; index: number }) {
  const palettes = [
    ["0x0b0b14", "0x4c1d95", "0x0b0b14", "0x0e7490"],
    ["0x09090f", "0x1e3a8a", "0x09090f", "0x7c3aed"],
    ["0x0a0a12", "0x0f766e", "0x0a0a12", "0x6d28d9"],
  ];
  const [c0, c1, c2, c3] = palettes[opts.index % palettes.length];
  const text = await textFilters({ text: scene.textOverlay, dir: tmp, key: scene.id, font: FONT_BOLD(), size: 104, centerY: H / 2 - 40, maxChars: 15, maxLines: 4 });
  const footer = opts.footer
    ? await textFilters({ text: opts.footer, dir: tmp, key: `${scene.id}-f`, font: FONT_MONO(), size: 36, centerY: H - 260, maxChars: 48, appearAt: 0.8, color: "0xa5b4fc", shadow: false })
    : [];
  await ffmpeg([
    "-f", "lavfi",
    "-i", `gradients=s=${W}x${H}:r=${FPS}:d=${scene.duration}:c0=${c0}:c1=${c1}:c2=${c2}:c3=${c3}:nb_colors=4:speed=0.015:type=spiral`,
    "-vf", ["boxblur=60:2", "eq=saturation=1.15", "noise=alls=7:allf=t", "vignette=PI/4", ...text, ...footer].join(","),
    "-t", String(scene.duration), ...ENCODE, "-an", out,
  ]);
}

/** Normalises a Higgsfield clip (any size/fps/length) to the scene's slot. */
async function renderClipScene(scene: Scene, clip: string, out: string, tmp: string) {
  const clipDur = await probeDuration(clip);
  const pad = Math.max(0, scene.duration - clipDur + 0.1);
  const text = await textFilters({ text: scene.textOverlay, dir: tmp, key: scene.id, font: FONT_BOLD(), size: 96, centerY: H / 2, maxChars: 16 });
  await ffmpeg([
    "-i", clip,
    "-vf",
    [
      `scale=${W}:${H}:force_original_aspect_ratio=increase`,
      `crop=${W}:${H}`,
      `fps=${FPS}`,
      "setsar=1",
      ...(pad > 0 ? [`tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)}`] : []),
      "eq=brightness=-0.08",
      ...text,
    ].join(","),
    "-t", String(scene.duration), ...ENCODE, "-an", out,
  ]);
}

/** Procedural ambient bed (A-minor add9 pad + soft pulse). Used when no music file is configured. */
function synthMusicInput(duration: number): string[] {
  const notes = [110, 220, 261.63, 329.63, 493.88];
  const pad = notes.map((f, i) => `${(0.07 / (i + 1)).toFixed(3)}*sin(2*PI*${f}*t)*(0.75+0.25*sin(2*PI*${0.1 + i * 0.05}*t))`).join("+");
  const pulse = "0.18*sin(2*PI*52*t)*exp(-9*mod(t,0.5))";
  return ["-f", "lavfi", "-i", `aevalsrc='${pad}+${pulse}|${pad}+${pulse}':s=48000:d=${duration.toFixed(2)}`];
}

export interface AssembleInput {
  storyboard: Storyboard;
  /** Resolves a storyboard screenshot path (relative to job dir) to an absolute file. */
  resolveShot: (rel: string) => string;
  /** Absolute path of a Higgsfield clip for this scene, if one was generated. */
  clipFor: (sceneId: string) => string | null;
  workDir: string;
  output: string;
  poster: string;
  repoLabel: string;
  /** Absolute path of an ElevenLabs narration (mp3). When set, music is ducked under it. */
  voiceover?: string | null;
  onProgress?: (msg: string) => Promise<void> | void;
}

/** Narration starts after the opening beat and must end before the final fade. */
const VOICE_DELAY = 0.7;
const VOICE_TAIL = 1.0;
const MAX_TEMPO = 1.2;

export async function assembleVideo(input: AssembleInput): Promise<{ duration: number }> {
  const { storyboard, workDir } = input;
  const tmp = path.join(workDir, "render");
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.mkdir(tmp, { recursive: true });

  const clips: string[] = [];
  const scenes = storyboard.scenes;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const out = path.join(tmp, `${s.id}.mp4`);
    await input.onProgress?.(`Rendering ${s.id} (${i + 1}/${scenes.length})`);
    const higgs = input.clipFor(s.id);
    const isLast = i === scenes.length - 1;
    if (s.visualType === "screenshot" && s.screenshot) {
      await renderScreenshotScene(s, input.resolveShot(s.screenshot), out, tmp);
    } else if (higgs) {
      await renderClipScene(s, higgs, out, tmp);
    } else {
      await renderTitleScene(s, out, tmp, { index: i, footer: isLast ? `${input.repoLabel}  ·  made with DemoForge` : undefined });
    }
    clips.push(out);
  }

  // Chain xfade transitions. Offset of transition k = length of everything merged so far - fade length.
  const parts: string[] = [];
  let prev = "[0:v]";
  let length = scenes[0].duration;
  for (let k = 1; k < clips.length; k++) {
    const tr = scenes[k].transition;
    const d = tr === "cut" ? 0.04 : XFADE;
    const kind = tr === "cut" ? "fade" : tr;
    const label = `[v${k}]`;
    parts.push(`${prev}[${k}:v]xfade=transition=${kind}:duration=${d}:offset=${(length - d).toFixed(3)}${label}`);
    prev = label;
    length += scenes[k].duration - d;
  }
  const total = length;
  parts.push(`${prev}fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6,format=yuv420p[vout]`);

  const musicIdx = clips.length;
  const music =
    config.musicPath && (await fs.access(config.musicPath).then(() => true, () => false))
      ? ["-stream_loop", "-1", "-i", config.musicPath]
      : synthMusicInput(total + 1);
  const voice = input.voiceover && (await fs.access(input.voiceover).then(() => true, () => false)) ? input.voiceover : null;
  const musicChain =
    `[${musicIdx}:a]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,lowpass=f=5000,` +
    `afade=t=in:st=0:d=1,afade=t=out:st=${(total - 1.5).toFixed(3)}:d=1.5,` +
    // Duck the music under narration so every word is clear.
    `volume=${voice ? "0.28" : "0.8"},aformat=sample_rates=48000:channel_layouts=stereo`;
  if (!voice) parts.push(`${musicChain}[aout]`);
  else {
    // Speed narration up slightly (max 1.2×) if it would overrun; anything still longer is faded out at the end.
    const room = Math.max(1, total - VOICE_DELAY - VOICE_TAIL);
    const voiceDur = await probeDuration(voice).catch(() => room);
    const tempo = Math.min(MAX_TEMPO, Math.max(1, voiceDur / room));
    const delayMs = Math.round(VOICE_DELAY * 1000);
    parts.push(`${musicChain}[bg]`);
    parts.push(
      `[${musicIdx + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,atempo=${tempo.toFixed(3)},` +
        `adelay=${delayMs}|${delayMs},apad,atrim=0:${total.toFixed(3)},` +
        `afade=t=out:st=${Math.max(0, total - 0.8).toFixed(3)}:d=0.8,volume=1.15[vo]`,
    );
    parts.push(`[bg][vo]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95,aformat=sample_rates=48000:channel_layouts=stereo[aout]`);
  }

  await input.onProgress?.("Joining scenes and mixing audio");
  await ffmpeg(
    [
      ...clips.flatMap((c) => ["-i", c]),
      ...music,
      ...(voice ? ["-i", voice] : []),
      "-filter_complex", parts.join(";"),
      "-map", "[vout]", "-map", "[aout]",
      ...ENCODE, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest",
      input.output,
    ],
    10 * 60_000,
  );

  const duration = await probeDuration(input.output);
  if (!(await probeHasVideo(input.output))) throw new Error("Assembled file has no video stream");
  // Poster: middle of the first real-UI scene if there is one, else just after the hook text lands.
  let posterAt = 1.2;
  let t0 = 0;
  for (let k = 0; k < scenes.length; k++) {
    if (scenes[k].visualType === "screenshot") {
      posterAt = t0 + scenes[k].duration / 2;
      break;
    }
    t0 += scenes[k].duration - (k + 1 < scenes.length ? (scenes[k + 1].transition === "cut" ? 0.04 : XFADE) : 0);
  }
  await ffmpeg(["-ss", Math.min(posterAt, duration - 0.1).toFixed(2), "-i", input.output, "-frames:v", "1", "-q:v", "3", input.poster]);
  return { duration };
}
