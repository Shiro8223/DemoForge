import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { config } from "@/lib/config";
import { transitionOverlap } from "@/lib/storyboard";
import type { AspectRatio, MotionStyle, Scene, Storyboard, VideoFilter } from "@/lib/validation/schemas";

/**
 * FFmpeg assembly. Every scene is rendered to a normalised 1080x1920 (9:16) or 1920x1080 (16:9),
 * 30fps, yuv420p clip, then clips are joined with xfade transitions, colour graded, and mixed with
 * music and the optional voiceover.
 * All arguments are passed as argv (never through a shell) and overlay text is
 * written to files consumed via drawtext's `textfile=`, so no escaping issues.
 */

export const FPS = 30;

export interface Frame {
  W: number;
  H: number;
  portrait: boolean;
}

export const frameFor = (aspect: AspectRatio): Frame => (aspect === "16:9" ? { W: 1920, H: 1080, portrait: false } : { W: 1080, H: 1920, portrait: true });

/** Colour grade per filter, applied to the joined video. Checked against FFmpeg 9. */
export const GRADES: Record<VideoFilter, string | null> = {
  none: null,
  cinematic: "eq=contrast=1.08:saturation=0.92,colorbalance=rs=-0.06:gs=-0.01:bs=0.08:rh=0.07:gh=0.02:bh=-0.06,vignette=PI/5",
  noir: "hue=s=0,eq=contrast=1.3:brightness=-0.03,vignette=PI/4",
  vintage: "curves=preset=vintage,eq=saturation=0.85,noise=alls=8:allf=t,vignette=PI/4",
  vivid: "eq=saturation=1.45:contrast=1.08",
  warm: "colorbalance=rs=0.08:gs=0.02:bs=-0.08:rm=0.06:bm=-0.05",
  cool: "colorbalance=rs=-0.07:bs=0.1:rm=-0.04:bm=0.07",
};

const FONT_BOLD = () => path.join(config.fontsDir, "InterDisplay-Bold.otf");
const FONT_MED = () => path.join(config.fontsDir, "Inter-Medium.otf");
const FONT_MONO = () => path.join(config.fontsDir, "JetBrainsMono-Regular.ttf");

async function ffmpeg(args: string[], timeout = 5 * 60_000) {
  const r = await execa(config.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { timeout, reject: false, all: true, windowsHide: true });
  if (r.exitCode !== 0) throw new Error(`ffmpeg failed: ${(r.all ?? "").slice(-1200)}`);
}

/**
 * Fails fast with a clear message when FFmpeg/ffprobe can't be launched (e.g. not on PATH), instead
 * of a misleading "not a valid video". Run before anything that spends Higgsfield credits.
 */
export async function assertFfmpeg(): Promise<void> {
  for (const [bin, env] of [[config.ffmpeg, "FFMPEG_PATH"], [config.ffprobe, "FFPROBE_PATH"]] as const) {
    const r = await execa(bin, ["-version"], { reject: false, windowsHide: true });
    if (r.exitCode !== 0)
      throw new Error(`${path.basename(bin)} can't be run ("${bin}"). Install FFmpeg, or set ${env} in .env to the full path of the executable, then restart.`);
  }
}

export async function probeDuration(file: string): Promise<number> {
  const r = await execa(config.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { reject: false, windowsHide: true });
  const d = parseFloat(r.stdout);
  if (r.exitCode !== 0 || Number.isNaN(d)) throw new Error(`Not a readable media file: ${path.basename(file)}`);
  return d;
}

export async function probeHasVideo(file: string): Promise<boolean> {
  const r = await execa(config.ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file], { reject: false, windowsHide: true });
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
  /** Caption style: each line on a translucent box that slides in from the left. */
  box?: boolean;
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
    // Ease-out over 0.5s: lines rise 24px (centred style) or glide 80px in from the left (boxed caption).
    const ease = `(1-pow(1-min(1,max(0,(t-${delay})/0.5)),3))`;
    const y = opts.box ? `${top + i * lh}` : `${top + i * lh}+24*(1-${ease})`;
    const x = opts.box ? `(w-text_w)/2-80*(1-${ease})` : "(w-text_w)/2";
    filters.push(
      `drawtext=fontfile='${fp(opts.font)}':textfile='${fp(file)}':fontsize=${opts.size}:fontcolor=${opts.color ?? "white"}` +
        `:x='${x}':y='${y}':alpha='${alpha}'` +
        (opts.box ? `:box=1:boxcolor=black@0.55:boxborderw=${Math.round(opts.size * 0.32)}` : "") +
        (opts.shadow === false || opts.box ? "" : ":shadowcolor=black@0.55:shadowx=0:shadowy=6"),
    );
  }
  return filters;
}

const ENCODE = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", String(FPS)];

/** Real screenshot inside a rounded "device card" over a blurred copy of itself, with a slow push-in. */
type Move = "in" | "out" | "pan";

/**
 * zoompan expressions for one camera move, eased in and out. The opener zooms in, the closer pulls back, and
 * the scenes between alternate so consecutive shots flow instead of repeating. Strength follows the Motion setting.
 */
export function cameraMove(index: number, count: number, motion: MotionStyle = "glide", frames: number) {
  const amount = { glide: 0.08, zoom: 0.2, dramatic: 0.13 }[motion];
  const move: Move = index === 0 ? "in" : index === count - 1 ? "out" : (["pan", "in", "out"] as const)[(index - 1) % 3];
  const e = `((1-cos(PI*on/${frames}))/2)`;
  // "zoom" heads for the upper middle, where most UIs keep their headline content; the others stay centred.
  const fy = motion === "zoom" ? 0.35 : 0.5;
  if (move === "pan") {
    const z = (1 + amount).toFixed(3);
    const from = index % 2 ? 0.15 : 0.85;
    return { z, x: `(iw-iw/zoom)*(${from}+${(1 - 2 * from).toFixed(2)}*${e})`, y: `(ih-ih/zoom)*${fy}` };
  }
  const [a, b] = move === "in" ? [1, 1 + amount] : [1 + amount, 1];
  return { z: `${a}${b >= a ? "+" : "-"}${Math.abs(b - a).toFixed(3)}*${e}`, x: "(iw-iw/zoom)*0.5", y: `(ih-ih/zoom)*${fy}` };
}

async function renderScreenshotScene(scene: Scene, shotFile: string, out: string, tmp: string, f: Frame, cam: ReturnType<typeof cameraMove>) {
  const { W, H } = f;
  const still = path.join(tmp, `${scene.id}-still.png`);
  // Portrait: phone-shaped card under a headline. Landscape: wide browser-shaped card under a one-line title.
  const { cardW, cardH, cardY } = f.portrait ? { cardW: 900, cardH: 1360, cardY: 440 } : { cardW: 1500, cardH: 820, cardY: 210 };
  const r = f.portrait ? 44 : 28;
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
  const text = await textFilters(
    f.portrait
      ? { text: scene.textOverlay, dir: tmp, key: scene.id, font: FONT_BOLD(), size: 76, centerY: 250, maxChars: 20 }
      : { text: scene.textOverlay, dir: tmp, key: scene.id, font: FONT_BOLD(), size: 64, centerY: 108, maxChars: 44, maxLines: 2 },
  );
  await ffmpeg([
    "-loop", "1", "-framerate", String(FPS), "-i", still,
    "-filter_complex",
    [
      // Upscale first so zoompan's integer rounding doesn't cause visible jitter.
      `[0]scale=${W * 2}:${H * 2},zoompan=z='${cam.z}':x='${cam.x}':y='${cam.y}':d=1:s=${W}x${H}:fps=${FPS}`,
      ...text,
    ].join(","),
    "-frames:v", String(frames), ...ENCODE, "-an", out,
  ]);
}

/** Locally rendered motion-graphics card. Used for generated scenes when Higgsfield is unavailable. */
async function renderTitleScene(scene: Scene, out: string, tmp: string, f: Frame, opts: { footer?: string; index: number }) {
  const { W, H } = f;
  const palettes = [
    ["0x0b0b14", "0x4c1d95", "0x0b0b14", "0x0e7490"],
    ["0x09090f", "0x1e3a8a", "0x09090f", "0x7c3aed"],
    ["0x0a0a12", "0x0f766e", "0x0a0a12", "0x6d28d9"],
  ];
  const [c0, c1, c2, c3] = palettes[opts.index % palettes.length];
  const text = await textFilters({
    text: scene.textOverlay, dir: tmp, key: scene.id, font: FONT_BOLD(),
    size: f.portrait ? 104 : 110, centerY: H / 2 - 40, maxChars: f.portrait ? 15 : 26, maxLines: f.portrait ? 4 : 3,
  });
  const footer = opts.footer
    ? await textFilters({ text: opts.footer, dir: tmp, key: `${scene.id}-f`, font: FONT_MONO(), size: 36, centerY: H - (f.portrait ? 260 : 110), maxChars: f.portrait ? 48 : 80, appearAt: 0.8, color: "0xa5b4fc", shadow: false })
    : [];
  await ffmpeg([
    "-f", "lavfi",
    "-i", `gradients=s=${W}x${H}:r=${FPS}:d=${scene.duration}:c0=${c0}:c1=${c1}:c2=${c2}:c3=${c3}:nb_colors=4:speed=0.015:type=spiral`,
    "-vf", ["boxblur=60:2", "eq=saturation=1.15", "noise=alls=7:allf=t", "vignette=PI/4", ...text, ...footer].join(","),
    "-t", String(scene.duration), ...ENCODE, "-an", out,
  ]);
}

/**
 * Normalises a Higgsfield clip (any size/fps/length) to the scene's slot. A clip that morphs into the next
 * screenshot (`whole`) is sped up to fit rather than cut short, so its last frame (the next screen) is reached.
 */
async function renderClipScene(scene: Scene, clip: string, out: string, tmp: string, f: Frame, whole = false) {
  const { W, H } = f;
  const clipDur = await probeDuration(clip);
  // Never slow footage down, and never past 2.5x; beyond that it's trimmed as before.
  const speed = whole && clipDur > scene.duration ? Math.min(2.5, clipDur / scene.duration) : 1;
  const pad = Math.max(0, scene.duration - clipDur / speed + 0.1);
  // Animated footage carries the scene, so the caption sits in the lower third instead of over the action.
  const lh = f.portrait ? 84 : 72;
  const text = await textFilters({
    text: scene.textOverlay, dir: tmp, key: scene.id, font: FONT_BOLD(), size: lh, box: true, appearAt: 0.4,
    centerY: Math.round(H * (f.portrait ? 0.78 : 0.8)), maxChars: f.portrait ? 18 : 34, maxLines: 2,
  });
  await ffmpeg([
    "-i", clip,
    "-vf",
    [
      ...(speed > 1 ? [`setpts=PTS/${speed.toFixed(4)}`] : []),
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
  /** True when this scene's clip ends on the next scene's screenshot (Higgsfield end frame). */
  blendsIntoNext?: (sceneId: string) => boolean;
  workDir: string;
  output: string;
  poster: string;
  repoLabel: string;
  /** Colour grade for the final cut. */
  filter?: VideoFilter;
  /** Camera style for locally animated screenshots. */
  motion?: MotionStyle;
  /** Per-scene voiceover MP3s (absolute paths), placed at each scene's start. */
  voiceover?: { sceneId: string; file: string }[];
  onProgress?: (msg: string) => Promise<void> | void;
}

/** When each scene starts in the finished video (transitions overlap neighbouring scenes). */
export function sceneStarts(scenes: Pick<Scene, "duration" | "transition">[]): number[] {
  const starts: number[] = [];
  let t = 0;
  scenes.forEach((s, k) => {
    if (k > 0) t -= transitionOverlap(s);
    starts.push(t);
    t += s.duration;
  });
  return starts;
}

export async function assembleVideo(input: AssembleInput): Promise<{ duration: number }> {
  const { storyboard, workDir } = input;
  const frame = frameFor(storyboard.aspectRatio);
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
    if (higgs) {
      // Higgsfield footage wins for every scene, including screenshots it animated from the real UI.
      await renderClipScene(s, higgs, out, tmp, frame, input.blendsIntoNext?.(s.id) ?? false);
    } else if (s.visualType === "screenshot" && s.screenshot) {
      const cam = cameraMove(i, scenes.length, input.motion, Math.round(s.duration * FPS));
      await renderScreenshotScene(s, input.resolveShot(s.screenshot), out, tmp, frame, cam);
    } else {
      await renderTitleScene(s, out, tmp, frame, { index: i, footer: isLast ? `${input.repoLabel}  ·  made with DemoForge` : undefined });
    }
    clips.push(out);
  }

  // Chain xfade transitions. Offset of transition k = length of everything merged so far - fade length.
  const parts: string[] = [];
  let prev = "[0:v]";
  let length = scenes[0].duration;
  for (let k = 1; k < clips.length; k++) {
    const tr = scenes[k].transition;
    const d = transitionOverlap(scenes[k]);
    // A morph already lands on the next screen, so a plain dissolve makes the join invisible.
    const kind = tr === "cut" || input.blendsIntoNext?.(scenes[k - 1].id) ? "fade" : tr;
    const label = `[v${k}]`;
    parts.push(`${prev}[${k}:v]xfade=transition=${kind}:duration=${d}:offset=${(length - d).toFixed(3)}${label}`);
    prev = label;
    length += scenes[k].duration - d;
  }
  const total = length;
  const grade = GRADES[input.filter ?? "none"];
  parts.push(`${prev}${grade ? `${grade},` : ""}fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6,format=yuv420p[vout]`);

  const musicIdx = clips.length;
  const musicIn =
    config.musicPath && (await fs.access(config.musicPath).then(() => true, () => false))
      ? ["-stream_loop", "-1", "-i", config.musicPath]
      : synthMusicInput(total + 1);
  // Voiceover: each scene's line starts 0.3s into its scene; the music sits lower underneath.
  const starts = sceneStarts(scenes);
  const vo = (input.voiceover ?? [])
    .map((v) => ({ ...v, at: starts[scenes.findIndex((s) => s.id === v.sceneId)] }))
    .filter((v) => v.at !== undefined);
  const voInputs = vo.flatMap((v) => ["-i", v.file]);
  const music = vo.length ? "music" : "aout";
  parts.push(
    `[${musicIdx}:a]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,lowpass=f=5000,` +
      `afade=t=in:st=0:d=1,afade=t=out:st=${(total - 1.5).toFixed(3)}:d=1.5,volume=${vo.length ? 0.3 : 0.8},aformat=sample_rates=48000:channel_layouts=stereo[${music}]`,
  );
  if (vo.length) {
    vo.forEach((v, j) => {
      const ms = Math.round((v.at + 0.3) * 1000);
      parts.push(`[${musicIdx + 1 + j}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${ms}|${ms},volume=1.6[vo${j}]`);
    });
    parts.push(`[music]${vo.map((_, j) => `[vo${j}]`).join("")}amix=inputs=${vo.length + 1}:duration=first:normalize=0,alimiter=limit=0.95[aout]`);
  }

  await input.onProgress?.("Joining scenes and mixing audio");
  await ffmpeg(
    [
      ...clips.flatMap((c) => ["-i", c]),
      ...musicIn,
      ...voInputs,
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
    t0 += scenes[k].duration - (k + 1 < scenes.length ? transitionOverlap(scenes[k + 1]) : 0);
  }
  await ffmpeg(["-ss", Math.min(posterAt, duration - 0.1).toFixed(2), "-i", input.output, "-frames:v", "1", "-q:v", "3", input.poster]);
  return { duration };
}
