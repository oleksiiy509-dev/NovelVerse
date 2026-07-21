import { mockAudioBuffer } from '../processors/audio.js';

export function mockProvider(cfg) {
  return {
    id: 'mock', label: 'Mock provider', available: true, languages: ['en', 'uk', 'ru'],
    voices: [{ id: 'mock-narrator', name: 'Mock Narrator', language: cfg.defaultLanguage }],
    async synthesize(req) { return { audio: mockAudioBuffer(req.text, req.format), metadata: { synthetic: true, provider: 'mock' } }; },
    async transform(req) { return { audio: mockAudioBuffer(req.text || 'transformed audio', req.format), metadata: { synthetic: true, provider: 'mock', transformed: true } }; },
  };
}
