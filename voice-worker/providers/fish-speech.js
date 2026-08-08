import { localHttpProvider } from './local-http.js';
export function fishSpeechProvider() {
  return localHttpProvider({ id: 'fish-speech', label: 'Fish Speech (local)', envKey: 'FISH_SPEECH_URL', healthEnvKey: 'FISH_SPEECH_HEALTH_URL', healthFromEndpoint: true, payload: (request) => ({
    text: request.text,
    format: request.format || 'wav',
    // A NovelVerse voice name is not a Fish Speech server reference id. Sending it
    // caused a stock Fish Speech installation to reject every request. Cloning is
    // opt-in and must name a reference that was actually registered with Fish.
    reference_id: process.env.FISH_SPEECH_REFERENCE_ID || null,
    references: [],
    normalize: false,
    latency: 'normal',
    prosody: request.options,
  }) });
}
