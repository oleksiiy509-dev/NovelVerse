import { localHttpProvider } from './local-http.js';
export function kokoroProvider() {
  return localHttpProvider({ id: 'kokoro', label: 'Kokoro (local fallback)', envKey: 'KOKORO_URL', defaults: ['http://127.0.0.1:8880/v1/audio/speech'], payload: (request) => ({ input: request.text, voice: process.env.KOKORO_VOICE || request.voice, response_format: request.format || 'wav', speed: request.options?.rate || 1, narration: request.options }) });
}
