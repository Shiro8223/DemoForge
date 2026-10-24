import fs from "node:fs/promises";
import { config } from "@/lib/config";

/**
 * ElevenLabs text-to-speech for the optional voiceover.
 *
 *   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128
 *   xi-api-key: ELEVENLABS_API_KEY        body: { text, model_id }
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

/** Speaks `text` into an MP3 at `outFile`. */
export async function synthesizeSpeech(text: string, outFile: string): Promise<void> {
  const { apiKey, voiceId, model } = config.elevenlabs;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set.");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(explain(res.status, await res.text().catch(() => "")));
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length < 1000) throw new Error("ElevenLabs returned an empty audio file.");
  await fs.writeFile(outFile, audio);
}
