import fs from "node:fs/promises";
import { z } from "zod";
import { geminiAvailable, structured } from "@/lib/agent/gemini";
import type { ProjectAnalysis, Storyboard } from "@/types";

/**
 * Voiceover: a short narration script (Gemini, or a template from the on-screen text)
 * read by ElevenLabs text-to-speech, then mixed over the music in assembleVideo.
 *
 *   POST {ELEVENLABS_API_BASE}/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128
 *   header xi-api-key, body { text, model_id }  →  audio/mpeg
 *
 * Settings are read when used (not at import) so tests and restarts pick up .env changes.
 */
export function elevenlabsSettings() {
  return {
    apiKey: (process.env.ELEVENLABS_API_KEY || "").trim(),
    // "George": the voice ElevenLabs uses in its own API examples. Any voice id from your library works.
    voiceId: (process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb").trim(),
    model: (process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2").trim(),
    base: (process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io").replace(/\/+$/, ""),
  };
}

export const elevenlabsAvailable = () => elevenlabsSettings().apiKey.length > 0;

/** Comfortable narration pace. The mixer can speed speech up to 1.2× if a script runs long. */
export const WORDS_PER_SECOND = 2.4;

/** Usable narration time: leave a beat at the start and let the end card breathe. */
export const narrationSeconds = (videoSeconds: number) => Math.max(4, videoSeconds - 2);

export function maxWords(videoSeconds: number) {
  return Math.max(10, Math.floor(narrationSeconds(videoSeconds) * WORDS_PER_SECOND));
}

/** Plain spoken text: no markdown, emoji, URLs or stage directions; capped to a word budget. */
export function cleanScript(text: string, wordLimit: number): string {
  let s = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>~|]/g, "")
    .replace(/\[[^\]]*\]|\([^)]*(?:pause|music|beat)[^)]*\)/gi, "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = s.split(" ").filter(Boolean);
  if (words.length > wordLimit) {
    s = words.slice(0, wordLimit).join(" ");
    // End on a full sentence if one finishes in the last third, else close the clause cleanly.
    const lastStop = Math.max(s.lastIndexOf(". "), s.lastIndexOf("! "), s.lastIndexOf("? "));
    s = lastStop > s.length * 0.66 ? s.slice(0, lastStop + 1) : `${s.replace(/[,;:\-–—]+$/, "")}.`;
  }
  return s;
}

/** Deterministic script from the storyboard's own on-screen text. */
export function templateScript(sb: Storyboard, analysis: ProjectAnalysis): string {
  const name = analysis.name.trim();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const first = analysis.description.split(/(?<=[.!?])\s/)[0]?.trim() ?? "";
  // Say the name once: lead with the description if it already names the project.
  const intro = !first ? `Meet ${name}.` : norm(first).includes(norm(name)) ? first : `${name}. ${first}`;
  const seen = new Set([norm(name), norm(intro)]);
  const overlays = sb.scenes.map((s) => s.textOverlay.trim());
  const lines = overlays
    .filter((l, i) => {
      const n = norm(l);
      // Skip empty lines, repeats, and lines the intro already says.
      if (!n || seen.has(n) || norm(intro).includes(n)) return false;
      // The name is spoken in the intro; only the closing line may say it again.
      if (n.includes(norm(name)) && i !== overlays.length - 1) return false;
      seen.add(n);
      return true;
    })
    .map((l) => (/[.!?]$/.test(l) ? l : `${l}.`));
  // Thin on-screen text: add up to two verified features (from the code) before the closing line.
  const extras =
    lines.length < 3
      ? analysis.features
          .map((f) => f.trim())
          .filter((f) => f && !seen.has(norm(f)) && !norm(intro).includes(norm(f)))
          .slice(0, 2)
          .map((f) => (/[.!?]$/.test(f) ? f : `${f}.`))
      : [];
  const closing = lines.length && norm(lines[lines.length - 1]).includes(norm(name)) ? lines.splice(-1) : [];
  return cleanScript([intro, ...lines, ...extras, ...closing].join(" "), maxWords(sb.duration));
}

const scriptSchema = z.object({
  script: z.string().describe("The narration exactly as it should be spoken, plain text, one paragraph"),
});

export async function writeScript(sb: Storyboard, analysis: ProjectAnalysis): Promise<{ text: string; authoredBy: "gemini" | "template" }> {
  const limit = maxWords(sb.duration);
  if (!geminiAvailable()) return { text: templateScript(sb, analysis), authoredBy: "template" };
  const scenes = sb.scenes
    .map((s, i) => `${i + 1}. [${s.duration}s] ${s.title}: on screen "${s.textOverlay}" (${s.purpose})`)
    .join("\n");
  const { script } = await structured({
    effort: "low",
    schema: scriptSchema,
    system:
      "You write voiceover scripts for 20-30 second product promo videos made at a hackathon. " +
      "Confident, warm, concrete, like a launch trailer. Spoken English only: no markdown, emoji, URLs, " +
      "scene labels or stage directions. Never invent features, numbers, users or claims that are not in the facts given.",
    user:
      `Write the narration for this video. Hard limit: ${limit} words (it must fit ${narrationSeconds(sb.duration).toFixed(0)} seconds). ` +
      "Follow the scene order so the words line up with the visuals. End with one memorable closing line about the project.\n\n" +
      `Project: ${analysis.name}\nDescription: ${analysis.description || "(none)"}\nFramework: ${analysis.framework}\n` +
      `Features (verified from the code): ${analysis.features.join("; ") || "(none listed)"}\n\nScenes:\n${scenes}`,
  });
  return { text: cleanScript(script, limit), authoredBy: "gemini" };
}

function explain(status: number, body: string) {
  const detail = body.replace(/\s+/g, " ").slice(0, 240);
  // ElevenLabs answers 401 {"status":"quota_exceeded"} for a valid key with no characters left, so check quota first.
  if (status === 402 || /quota|credits|insufficient/i.test(body)) return `ElevenLabs account is out of characters/credits. ${detail}`;
  if (status === 401) return `ElevenLabs rejected the API key (check ELEVENLABS_API_KEY). ${detail}`;
  if (status === 404) return `ElevenLabs voice not found (check ELEVENLABS_VOICE_ID). ${detail}`;
  if (status === 429) return `ElevenLabs rate limit hit, try again in a moment. ${detail}`;
  return `ElevenLabs error ${status}: ${detail}`;
}

/** Text → MP3 file. Throws with a readable message on any failure. */
export async function synthesize(text: string, outFile: string): Promise<{ bytes: number; voiceId: string; model: string }> {
  const s = elevenlabsSettings();
  if (!s.apiKey) throw new Error("ELEVENLABS_API_KEY is not set.");
  if (!text.trim()) throw new Error("Voiceover script is empty.");
  const res = await fetch(`${s.base}/v1/text-to-speech/${encodeURIComponent(s.voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": s.apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: s.model }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(explain(res.status, await res.text().catch(() => "")));
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error("ElevenLabs returned an empty audio file.");
  await fs.writeFile(outFile, buf);
  return { bytes: buf.length, voiceId: s.voiceId, model: s.model };
}
