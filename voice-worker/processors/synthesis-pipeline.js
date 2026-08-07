import { createLocalEngines, engineOrder, getProvider } from '../providers/index.js';
import { prepareNarrationRequest } from './narration.js';

// Every narrator consumer (preview, one-shot synthesis, chapter production and
// studios) enters here. Keeping selection and fallback here prevents the engines
// from drifting between product surfaces.
export async function synthesizeNarration(cfg, request = {}) {
  if (request.provider && !['auto', 'narrator', ...engineOrder].includes(request.provider)) {
    return (await getProvider(request.provider, cfg)).synthesize(request);
  }
  const normalized = prepareNarrationRequest(request);
  const failures = [];
  for (const engine of createLocalEngines()) {
    try {
      const status = engine.inspect ? await engine.inspect() : engine.status;
      if (!(status?.available ?? engine.available)) { failures.push(`${engine.id}: unavailable`); continue; }
      const result = await engine.synthesize(normalized);
      return { ...result, metadata: { ...result.metadata, pipeline: 'narrator-core', selectedEngine: engine.id, fallbackOrder: engineOrder, failures } };
    } catch (error) { failures.push(`${engine.id}: ${error.message}`); }
  }
  throw Object.assign(new Error(`No offline narrator engine succeeded (${failures.join('; ')})`), { code: request.provider && engineOrder.includes(request.provider) ? 'provider_unavailable' : 'narrator_unavailable', status: 503 });
}
