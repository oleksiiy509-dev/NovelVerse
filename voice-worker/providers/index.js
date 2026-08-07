import { mockProvider } from './mock.js';
import { piperProvider } from './piper.js';
import { genericHttpProvider } from './generic-http.js';
import { kokoroProvider } from './kokoro.js';
import { fishSpeechProvider } from './fish-speech.js';
import { narratorVoice } from '../processors/narration.js';

export const engineOrder = ['fish-speech', 'kokoro', 'piper'];
const engines = () => [fishSpeechProvider(), kokoroProvider(), piperProvider()];

async function inspect(provider) {
  const status = provider.inspect ? await provider.inspect() : provider.status || { available: provider.available };
  return { ...provider, available: Boolean(status.available), status: { ...provider.status, ...status } };
}

export async function inspectProviders(cfg) {
  const checked = await Promise.all(engines().map(inspect));
  const ready = checked.filter(({ available }) => available);
  const narrator = {
    id: 'narrator', label: 'NovelVerse Narrator Core', available: ready.length > 0,
    status: { available: ready.length > 0, selectedEngine: ready[0]?.id || null, fallbackOrder: engineOrder, readyEngines: ready.map(({ id }) => id), checkedAt: new Date().toISOString() },
    languages: [...new Set(checked.flatMap(({ languages }) => languages || []))],
    voices: [{ id: narratorVoice(), name: 'NovelVerse Narrator', language: cfg.defaultLanguage }],
  };
  return [narrator, ...checked, genericHttpProvider(cfg), mockProvider(cfg)];
}

export async function getProvider(id, cfg) {
  const provider = (await inspectProviders(cfg)).find((item) => item.id === id);
  if (!provider) throw Object.assign(new Error(`Unknown provider: ${id}`), { status: 400, code: 'unknown_provider' });
  if (!provider.available) throw Object.assign(new Error(`Provider unavailable: ${id}`), { status: 503, code: 'provider_unavailable' });
  return provider;
}

export function createLocalEngines() { return engines(); }
