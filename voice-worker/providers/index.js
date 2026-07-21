import { mockProvider } from './mock.js';
import { piperProvider } from './piper.js';
import { genericHttpProvider } from './generic-http.js';
import { kokoroProvider } from './kokoro.js';

export function getProviders(cfg) { return [mockProvider(cfg), piperProvider(cfg), genericHttpProvider(cfg), kokoroProvider(cfg)]; }
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
