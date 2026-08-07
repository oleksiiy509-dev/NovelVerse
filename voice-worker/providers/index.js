import { mockProvider } from './mock.js';
import { piperProvider } from './piper.js';
import { genericHttpProvider } from './generic-http.js';
import { kokoroProvider } from './kokoro.js';
import { fishSpeechProvider } from './fish-speech.js';
import { prepareNarrationRequest, narratorVoice } from '../processors/narration.js';

const engineOrder = ['fish-speech', 'kokoro', 'piper'];
function narratorProvider(cfg) {
  const engines = [fishSpeechProvider(cfg), kokoroProvider(cfg), piperProvider(cfg)];
  const ready = engines.filter(({ available }) => available);
  return { id: 'narrator', label: 'NovelVerse Narrator 2.0', available: ready.length > 0, status: { available: ready.length > 0, primary: 'fish-speech', fallbackOrder: engineOrder, readyEngines: ready.map(({ id }) => id) }, languages: [...new Set(engines.flatMap(({ languages }) => languages || []))], voices: [{ id: narratorVoice(), name: 'NovelVerse Narrator', language: cfg.defaultLanguage }], async synthesize(request) { const failures = []; for (const engine of engines) { if (!engine.available) { failures.push(`${engine.id}: unavailable`); continue; } try { const result = await engine.synthesize(prepareNarrationRequest(request)); return { ...result, metadata: { ...result.metadata, narrator: '2.0', fallbackOrder: engineOrder, attempted: failures.map((item) => item.split(':')[0]) } }; } catch (error) { failures.push(`${engine.id}: ${error.message}`); } } throw Object.assign(new Error(`No local narrator engine succeeded (${failures.join('; ')})`), { code: 'narrator_unavailable', status: 503 }); } };
}
export function getProviders(cfg) { return [narratorProvider(cfg), fishSpeechProvider(cfg), kokoroProvider(cfg), piperProvider(cfg), genericHttpProvider(cfg), mockProvider(cfg)]; }
export function getProvider(id, cfg) {
  const provider = getProviders(cfg).find((item) => item.id === id);
  if (!provider) {
    const err = new Error(`Unknown provider: ${id}`); err.status = 400; err.code = 'unknown_provider'; throw err;
  }
  if (!provider.available) {
    const err = new Error(`Provider unavailable: ${id}`); err.status = 503; err.code = 'provider_unavailable'; throw err;
  }
  return provider;
}
