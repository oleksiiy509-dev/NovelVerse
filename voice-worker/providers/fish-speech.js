import { localHttpProvider } from './local-http.js';
export function fishSpeechProvider() {
  return localHttpProvider({ id: 'fish-speech', label: 'Fish Speech (local)', envKey: 'FISH_SPEECH_URL', payload: (request) => ({ text: request.text, format: request.format || 'wav', reference_id: request.voice, normalize: false, latency: 'normal', prosody: request.options }) });
}
