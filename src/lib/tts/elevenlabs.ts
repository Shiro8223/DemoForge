import fs from "node:fs/promises";
import { config } from "@/lib/config";
import type { VoiceTone } from "@/lib/validation/schemas";

/**
 * ElevenLabs text-to-speech for the optional voiceover.
 *
 *   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128
 *   xi-api-key: ELEVENLABS_API_KEY        body: { text, model_id, voice_settings, previous_text, next_text }
 *
 * Tone sets the delivery: lower stability and more style = more expressive. eleven_v3 has no request
 * stitching or style slider, so there the tone becomes an audio tag ("[excited]") instead.
 *
 * The key stays on the server and is never passed to repository code.
 */

export const elevenLabsConfigured = () => !!config.elevenlabs.apiKey;

function explain(status: number, body: string) {
  if (status === 401) return "ElevenLabs rejected the API key (check ELEVENLABS_API_KEY).";
  if (status === 402 || /quota|credit|character/i.test(body)) return "ElevenLabs account is out of characters/credits.";
  if (status === 404) return "ElevenLabs voice not found (check ELEVENLABS_VOICE_ID).";
  if (status === 429) return "ElevenLabs rate limit hit. Try again in a moment.";
  return `ElevenLabs error ${status}: ${body.slice(0, 200)}`;
}

const TONES: Record<VoiceTone, { stability: number; style: number; speed: number; tag: string }> = {
  friendly: { stability: 0.45, style: 0.35, speed: 1, tag: "[warmly]" },
  hype: { stability: 0.3, style: 0.7, speed: 1.08, tag: "[excited]" },
  calm: { stability: 0.7, style: 0.15, speed: 0.95, tag: "[calmly]" },
  epic: { stability: 0.4, style: 0.6, speed: 0.95, tag: "[dramatic]" },
};

export interface SpeechOptions {
  /** Overrides ELEVENLABS_VOICE_ID. */
  voiceId?: string;
  tone?: VoiceTone;
  /** The rest of the script around this line, so separate recordings sound like one read. */
  previousText?: string;
  nextText?: string;
}

/** Speaks `text` into an MP3 at `outFile`. */
export async function synthesizeSpeech(text: string, outFile: string, opts: SpeechOptions = {}): Promise<void> {
  const { apiKey, model } = config.elevenlabs;
  const voiceId = opts.voiceId || config.elevenlabs.voiceId;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set.");
  const tone = TONES[opts.tone ?? "friendly"];
  const v3 = model.startsWith("eleven_v3");
  const body = v3
    ? // v3 only accepts stability 0 / 0.5 / 1 (creative / natural / robust).
      { text: `${tone.tag} ${text}`, model_id: model, voice_settings: { stability: tone.stability < 0.4 ? 0 : tone.stability > 0.6 ? 1 : 0.5 } }
    : {
        text,
        model_id: model,
        voice_settings: { stability: tone.stability, similarity_boost: 0.75, style: tone.style, use_speaker_boost: true, speed: tone.speed },
        previous_text: opts.previousText?.slice(-500),
        next_text: opts.nextText?.slice(0, 500),
      };
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(explain(res.status, await res.text().catch(() => "")));
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length < 1000) throw new Error("ElevenLabs returned an empty audio file.");
  await fs.writeFile(outFile, audio);
}
