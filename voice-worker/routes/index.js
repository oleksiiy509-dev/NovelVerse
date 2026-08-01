import { Router } from 'express';
import { getProvider, getProviders } from '../providers/index.js';
import { validateRequest } from '../utils/validation.js';
import { getCachedAudio, putCachedAudio } from '../utils/cache.js';
import { contentType } from '../processors/audio.js';

export const router = Router();
const version = '1.0.0';

router.get('/health', (req, res) => {
  const providers = getProviders(req.app.locals.config);
  res.json({ ok: true, version, providers: providers.map(({ id, available }) => ({ id, available })), availableVoices: providers.flatMap((p) => p.voices || []), uptime: process.uptime(), memoryUsage: process.memoryUsage() });
});
router.get('/providers', (req, res) => res.json({ ok: true, providers: getProviders(req.app.locals.config).map(({ synthesize, transform, ...safe }) => safe) }));
router.get('/voices', (req, res) => res.json({ ok: true, providers: getProviders(req.app.locals.config).map(({ synthesize, transform, ...safe }) => safe) }));
router.get('/status', (req, res) => res.json({ ok: true, defaultProvider: req.app.locals.config.defaultProvider, uptime: process.uptime() }));
router.get('/ready', (req, res) => {
  const runtime = req.app.locals.runtime;
  const ready = runtime.queue.accepting;
  res.status(ready ? 200 : 503).json({ ok: ready, queue: runtime.queue.status });
});
router.get('/metrics', (req, res) => {
  const { metrics, queue, startedAt } = req.app.locals.runtime;
  const averageLatencyMs = metrics.requests ? metrics.latencyMs / metrics.requests : 0;
  res.json({ ok: true, uptimeSeconds: (Date.now() - startedAt) / 1000, queue: queue.status, counters: { ...metrics, averageLatencyMs } });
});

async function render(req, res, mode) {
  const cfg = req.app.locals.config;
  const payload = validateRequest(req.body);
  const provider = getProvider(payload.provider || cfg.defaultProvider, cfg);
  const text = mode === 'preview' ? (payload.text || 'NovelVerse voice preview sentence.').split(/[.!?]/)[0].slice(0, 240) : payload.text;
  if (mode !== 'transform' && !text) throw Object.assign(new Error('text is required'), { status: 400, code: 'bad_request' });
  const normalized = { ...payload, text, language: payload.language || cfg.defaultLanguage };
  const cachePayload = { mode, provider: provider.id, ...normalized };
  let cached = await getCachedAudio(cfg, cachePayload, normalized.format);
  let result;
  if (cached.hit) {
    req.app.locals.runtime.metrics.cacheHits += 1;
    result = { audio: cached.audio, metadata: { provider: provider.id } };
  } else {
    req.app.locals.runtime.metrics.cacheMisses += 1;
    try {
      result = await req.app.locals.runtime.queue.run(() => mode === 'transform' && provider.transform ? provider.transform(normalized) : provider.synthesize(normalized));
    } catch (error) {
      if (error.code === 'queue_full') req.app.locals.runtime.metrics.queueRejected += 1;
      throw error;
    }
    cached = await putCachedAudio(cfg, cachePayload, result.audio, normalized.format);
  }
  res.setHeader('content-type', contentType(normalized.format));
  res.setHeader('x-novelverse-metadata', Buffer.from(JSON.stringify({ ...result.metadata, cacheKey: cached.key, cacheHit: cached.hit })).toString('base64'));
  res.send(result.audio);
}
router.post('/preview', (req, res, next) => render(req, res, 'preview').catch(next));
router.post('/synthesize', (req, res, next) => render(req, res, 'synthesize').catch(next));
router.post('/transform', (req, res, next) => render(req, res, 'transform').catch(next));
