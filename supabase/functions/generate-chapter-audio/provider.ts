export type SpeechRequest = { text: string; language: string; voice: string; format: "mp3" };
export type SpeechResult = { ok: true; audio: Uint8Array; contentType: string; durationSeconds?: number } | { ok: false; code: "provider_not_configured" | "provider_error"; message: string };

export async function generateSpeech(_request: SpeechRequest): Promise<SpeechResult> {
  return { ok: false, code: "provider_not_configured", message: "No server-side TTS provider is configured for NovelVerse AI Audio Engine v2." };
}
