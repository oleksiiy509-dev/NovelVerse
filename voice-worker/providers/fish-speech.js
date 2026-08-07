import { localEndpoint, postLocalAudio } from './local-http.js';

export function fishSpeechProvider() {
  const endpoint = localEndpoint(process.env.FISH_SPEECH_URL, 'http://127.0.0.1:8080/v1/tts');
  const available = Boolean(endpoint && process.env.FISH_SPEECH_ENABLED !== 'false');
  const voice = process.env.NARRATOR_VOICE || process.env.FISH_SPEECH_VOICE || 'narrator';
  return {
    id: 'fish-speech', label: 'Fish Speech (local, preferred)', available,
    status: { endpoint, localOnly: true }, languages: ['en', 'uk', 'ru'],
    voices: [{ id: voice, name: 'NovelVerse narrator', language: process.env.DEFAULT_LANGUAGE || 'en' }],
    async synthesize(req) {
      const audio = await postLocalAudio(endpoint, { text: req.text, format: req.format || 'wav', reference_id: voice, emotion: req.options.emotion, intensity: req.options.intensity }, 'Fish Speech');
      return { audio, metadata: { provider: 'fish-speech', voice, emotion: req.options.emotion, intensity: req.options.intensity, local: true } };
    },
  };
}
