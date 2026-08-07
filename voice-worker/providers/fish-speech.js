import { localHttpProvider } from './local-http.js';
export function fishSpeechProvider() {
  return localHttpProvider({
    id: 'fish-speech', label: 'Fish Speech (local)', envKey: 'FISH_SPEECH_URL',
    defaults: ['http://127.0.0.1:8080/v1/tts', 'http://127.0.0.1:8080/v1/tts/'],
    payload: (request) => ({ text: request.text, format: request.format || 'wav', streaming: false, normalize: true, latency: 'normal', references: [], ...(process.env.FISH_SPEECH_VOICE ? { reference_id: process.env.FISH_SPEECH_VOICE } : {}), prosody: request.options }),
  });
}
