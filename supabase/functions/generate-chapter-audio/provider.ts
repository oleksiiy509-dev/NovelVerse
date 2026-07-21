export type AudioProviderId = string;
export type AudioFormat = "mp3";

export type AudioRenderSegmentRequest = {
  segmentId: string;
  text: string;
  language: string;
  speaker: string;
  castSlot: string;
  voiceProfile: string;
  emotion: string;
  intensity: number;
  pace: number;
  pauses: { beforeMs: number; afterMs: number };
  emphasis: string[];
  format: AudioFormat;
};

export type AudioProvider = {
  id: AudioProviderId;
  version: string;
  contentType: string;
  renderSegment(request: AudioRenderSegmentRequest): Promise<Uint8Array>;
  estimateDurationSeconds?(request: AudioRenderSegmentRequest, audio: Uint8Array): number;
};

export type SpeechRequest = { text: string; language: string; voice: string; format: AudioFormat };
export type SpeechResult = { ok: true; audio: Uint8Array; contentType: string; durationSeconds?: number } | { ok: false; code: "provider_not_configured" | "provider_error"; message: string };

class UnconfiguredAudioProvider implements AudioProvider {
  id = "unconfigured";
  version = "provider-abstraction-v1";
  contentType = "audio/mpeg";
  async renderSegment() {
    throw new Error("No server-side TTS provider is configured for NovelVerse Voice Engine Phase 4.");
  }
}

const providers = new Map<string, AudioProvider>();
providers.set("unconfigured", new UnconfiguredAudioProvider());

export function registerAudioProvider(provider: AudioProvider) {
  if (!provider?.id || !provider?.version || typeof provider.renderSegment !== "function") throw new Error("Invalid audio provider adapter.");
  providers.set(provider.id, provider);
}

export function getAudioProvider(providerId = Deno.env.get("NOVELVERSE_AUDIO_PROVIDER") || "unconfigured") {
  return providers.get(providerId) || providers.get("unconfigured")!;
}

export async function renderAudioSegment(providerId: string, request: AudioRenderSegmentRequest): Promise<SpeechResult & { provider: string; providerVersion: string }> {
  const provider = getAudioProvider(providerId);
  try {
    const audio = await provider.renderSegment(request);
    return { ok: true, audio, contentType: provider.contentType, durationSeconds: provider.estimateDurationSeconds?.(request, audio), provider: provider.id, providerVersion: provider.version };
  } catch (error) {
    const configured = provider.id !== "unconfigured";
    return { ok: false, code: configured ? "provider_error" : "provider_not_configured", message: error instanceof Error ? error.message : "Audio provider failed.", provider: provider.id, providerVersion: provider.version };
  }
}

export async function generateSpeech(request: SpeechRequest): Promise<SpeechResult> {
  return renderAudioSegment("unconfigured", { segmentId: "legacy", text: request.text, language: request.language, speaker: "Narrator", castSlot: request.voice, voiceProfile: request.voice, emotion: "neutral", intensity: 0.5, pace: 1, pauses: { beforeMs: 0, afterMs: 0 }, emphasis: [], format: request.format });
}
