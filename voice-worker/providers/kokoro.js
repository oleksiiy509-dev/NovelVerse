import { localEndpoint, postLocalAudio } from './local-http.js';

export function kokoroProvider() {
  const endpoint = localEndpoint(process.env.KOKORO_URL, 'http://127.0.0.1:8880/v1/audio/speech');
  const available = Boolean(endpoint && process.env.KOKORO_ENABLED !== 'false');
  const voice = process.env.NARRATOR_VOICE || process.env.KOKORO_VOICE || 'af_heart';
  return { id: 'kokoro', label: 'Kokoro (local fallback)', available, status: { endpoint, localOnly: true }, languages: ['en'], voices: [{ id: voice, name: 'NovelVerse narrator', language: 'en' }], async synthesize(req) {
    const speed = req.options?.delivery?.rate || 1;
    const audio = await postLocalAudio(endpoint, { model: process.env.KOKORO_MODEL || 'kokoro', input: req.text, voice, response_format: req.format || 'wav', speed }, 'Kokoro');
    return { audio, metadata: { provider: 'kokoro', voice, emotion: req.options.emotion, intensity: req.options.intensity, local: true } };
  } };
}
