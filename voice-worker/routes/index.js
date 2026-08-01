import { Router } from 'express';
import { getProvider, getProviders } from '../providers/index.js';
import { validateRequest } from '../utils/validation.js';
import { putCachedAudio } from '../utils/cache.js';
import { contentType } from '../processors/audio.js';
import { cancelChapterJob, createChapterJob, getChapterJob, publicJob } from '../processors/chapter-jobs.js';

export const router = Router();
const version = '1.0.0';

router.get('/health', (req, res) => {
  const providers = getProviders(req.app.locals.config);
  res.json({ ok: true, version, providers: providers.map(({ id, available }) => ({ id, available })), availableVoices: providers.flatMap((p) => p.voices || []), uptime: process.uptime(), memoryUsage: process.memoryUsage() });
});
router.get('/providers', (req, res) => res.json({ ok: true, providers: getProviders(req.app.locals.config).map(({ synthesize, transform, ...safe }) => safe) }));
router.get('/voices', (req, res) => res.json({ ok: true, providers: getProviders(req.app.locals.config).map(({ synthesize, transform, ...safe }) => safe) }));
router.get('/status', (req, res) => res.json({ ok: true, defaultProvider: req.app.locals.config.defaultProvider, uptime: process.uptime() }));
router.post('/chapter-jobs', async (req, res, next) => {
  try { res.status(202).json(await createChapterJob(req.app.locals.config, req.body)); } catch (error) { next(error); }
});
router.get('/chapter-jobs/:id', (req, res) => {
  const job = getChapterJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'job_not_found' });
  res.json(publicJob(job));
});
router.post('/chapter-jobs/:id/cancel', (req, res) => {
  const job = cancelChapterJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'job_not_found' });
  res.json(publicJob(job));
});
router.get('/chapter-jobs/:id/audio', async (req, res, next) => {
  const job = getChapterJob(req.params.id);
  if (!job?.file || job.status !== 'Finished') return res.status(404).json({ ok: false, error: 'audio_not_found' });
  try { res.type('audio/wav').setHeader('content-disposition', `attachment; filename="${job.fileName}"`); res.send(await import('node:fs/promises').then(({ readFile }) => readFile(job.file))); } catch (error) { next(error); }
});

async function render(req, res, mode) {
  const cfg = req.app.locals.config;
  const payload = validateRequest(req.body);
  const provider = getProvider(payload.provider || cfg.defaultProvider, cfg);
  const text = mode === 'preview' ? (payload.text || 'NovelVerse voice preview sentence.').split(/[.!?]/)[0].slice(0, 240) : payload.text;
  if (mode !== 'transform' && !text) throw Object.assign(new Error('text is required'), { status: 400, code: 'bad_request' });
  const normalized = { ...payload, text, language: payload.language || cfg.defaultLanguage };
  const result = mode === 'transform' && provider.transform ? await provider.transform(normalized) : await provider.synthesize(normalized);
  const cached = await putCachedAudio(cfg, { mode, provider: provider.id, ...normalized }, result.audio, normalized.format);
  res.setHeader('content-type', contentType(normalized.format));
  res.setHeader('x-novelverse-metadata', Buffer.from(JSON.stringify({ ...result.metadata, cacheKey: cached.key, cacheHit: cached.hit, file: cached.file })).toString('base64'));
  res.send(result.audio);
}
router.post('/preview', (req, res, next) => render(req, res, 'preview').catch(next));
router.post('/synthesize', (req, res, next) => render(req, res, 'synthesize').catch(next));
router.post('/transform', (req, res, next) => render(req, res, 'transform').catch(next));
