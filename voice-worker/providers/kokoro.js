import { localHttpProvider } from './local-http.js';
export function kokoroProvider() {
  return localHttpProvider({ id: 'kokoro', label: 'Kokoro (local fallback)', envKey: 'KOKORO_URL', healthEnvKey: 'KOKORO_HEALTH_URL', payload: (request) => ({ input: request.text, voice: request.voice, response_format: request.format || 'wav', speed: request.options?.rate || 1, narration: request.options }) });
}
