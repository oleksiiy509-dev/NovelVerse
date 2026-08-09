import { Router } from 'express';
import { access, mkdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { getProvider, getProviderStatuses } from '../providers/index.js';
import { validateRequest } from '../utils/validation.js';
import { putCachedAudio } from '../utils/cache.js';
import { contentType } from '../processors/audio.js';
import { cancelChapterJob, createChapterJob, deleteChapterAudio, getChapterAudio, getChapterAudioStream, getChapterJob, getChapterQueueStatus, publicJob, retryChapterJob, subscribeChapterAudio } from '../processors/chapter-jobs.js';

export const router = Router();
const version = '1.0.0';

router.get('/live', (_req, res) => res.json({ ok: true, status: 'alive', uptime: process.uptime() }));
router.get('/ready', async (req, res) => {
  const providers = await getProviderStatuses(req.app.locals.config);
  const configured = providers.filter(({ id }) => !['narrator', 'mock'].includes(id));
  const ready = configured.some(({ available }) => available);
  res.status(ready ? 200 : 503).json({ ok: ready, status: ready ? 'ready' : 'not_ready', providers: configured.map(({ id, available }) => ({ id, available })) });
});
router.get('/metrics', (_req, res) => {
  const memory = process.memoryUsage();
  res.type('text/plain').send([
    '# HELP novelverse_worker_uptime_seconds Worker process uptime.',
    '# TYPE novelverse_worker_uptime_seconds gauge',
    `novelverse_worker_uptime_seconds ${process.uptime()}`,
    '# HELP novelverse_worker_resident_memory_bytes Worker resident memory.',
    '# TYPE novelverse_worker_resident_memory_bytes gauge',
    `novelverse_worker_resident_memory_bytes ${memory.rss}`,
  ].join('\n') + '\n');
});

router.get('/health', async (req, res) => {
  const providers = await getProviderStatuses(req.app.locals.config);
  const queue = getChapterQueueStatus();
  let outputAvailable = true;
  try { await mkdir(req.app.locals.config.outputDir, { recursive: true }); await access(req.app.locals.config.outputDir, constants.W_OK); } catch { outputAvailable = false; }
  const ffmpeg = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true });
  const realProviders = providers.filter(({ id }) => !['narrator', 'mock'].includes(id));
  const providerAvailable = realProviders.some(({ available }) => available);
  const status = queue.busy ? 'BUSY' : providerAvailable ? 'ONLINE' : 'Worker connected, no voice provider available';
  res.json({ ok: true, online: true, workerConnected: true, providerAvailable, status, version, narratorVersion: '2.0.0', providers: providers.map(({ id, available, status: providerStatus }) => ({ id, provider: id, available, ready: available, reason: providerStatus?.reason || null })), availableVoices: realProviders.filter((p) => p.available).flatMap((p) => p.voices || []), queue, capabilities: { ffmpeg: ffmpeg.status === 0, outputAvailable }, uptime: process.uptime(), memoryUsage: process.memoryUsage() });
});
router.get('/providers', async (req, res) => res.json({ ok: true, providers: (await getProviderStatuses(req.app.locals.config)).map(({ synthesize, transform, checkHealth, ...safe }) => safe) }));
router.get('/voices', async (req, res) => res.json({ ok: true, providers: (await getProviderStatuses(req.app.locals.config)).map(({ synthesize, transform, checkHealth, ...safe }) => safe) }));
router.get('/status', (req, res) => res.json({ ok: true, defaultProvider: req.app.locals.config.defaultProvider, uptime: process.uptime() }));
router.post('/chapter-jobs', async (req, res, next) => {
  try { res.status(202).json(await createChapterJob(req.app.locals.config, req.body)); } catch (error) { next(error); }
});

async function resolveChapter(cfg, chapterId) {
  if (!cfg.chapterSourceUrl) return null;
  const response = await fetch(`${cfg.chapterSourceUrl.replace(/\/$/, '')}/${encodeURIComponent(chapterId)}`, {
    headers: cfg.chapterSourceToken ? { authorization: `Bearer ${cfg.chapterSourceToken}` } : {},
  });
  if (response.status === 404) return null;
  if (!response.ok) throw Object.assign(new Error('Chapter source is unavailable'), { status: 502, code: 'chapter_source_unavailable' });
  const chapter = await response.json();
  const text = String(chapter.content || chapter.text || '').trim();
  if (!text) throw Object.assign(new Error('Chapter has no narratable content'), { status: 422, code: 'empty_chapter' });
  return {
    chapterId, bookId: chapter.bookId || chapter.novelId || chapter.novel_id, bookTitle: chapter.bookTitle || chapter.novelTitle || 'NovelVerse',
    chapterNumber: chapter.chapterNumber || chapter.number, chapterTitle: chapter.chapterTitle || chapter.title,
    language: chapter.language, provider: chapter.provider || 'narrator', segments: chapter.segments || [{ text }],
  };
}

router.get('/audio/:chapterId', async (req, res, next) => {
  try {
    const cfg = req.app.locals.config;
    let job = await getChapterAudio(cfg, req.params.chapterId);
    if (!job) {
      const chapter = await resolveChapter(cfg, req.params.chapterId);
      if (!chapter) return res.status(404).json({ ok: false, error: 'chapter_not_found' });
      await createChapterJob(cfg, chapter);
      job = await getChapterAudio(cfg, req.params.chapterId);
    }
    const result = publicJob(job);
    res.status(result.status === 'completed' ? 200 : result.status === 'failed' ? 500 : 202).json({
      ...result,
      streamUrl: `/audio/${encodeURIComponent(req.params.chapterId)}/stream`,
      waitingForExistingRender: ['queued', 'rendering', 'uploading', 'retry'].includes(result.status),
    });
  } catch (error) { next(error); }
});

async function requestRender(req, res, next) {
  try {
    const job = await createChapterJob(req.app.locals.config, { ...req.body, chapterId: req.params.chapterId });
    res.status(job.status === 'completed' ? 200 : 202).json(job);
  } catch (error) { next(error); }
}
router.post('/audio/:chapterId/render', requestRender);
router.post('/audio/render/:chapterId', requestRender);

async function audioStatus(req, res, next) {
  try {
    const job = await getChapterAudio(req.app.locals.config, req.params.chapterId);
    if (!job) return res.status(404).json({ ok: false, error: 'audio_not_found' });
    res.json(publicJob(job));
  } catch (error) { next(error); }
}
router.get('/audio/:chapterId/status', audioStatus);
router.get('/audio/status/:chapterId', audioStatus);

async function audioStream(req, res, next) {
  try {
    const job = await getChapterAudio(req.app.locals.config, req.params.chapterId);
    if (!job) return res.status(404).json({ ok: false, error: 'audio_not_found' });
    if (!['Finished', 'Failed', 'Cancelled'].includes(job.status)) {
      if (req.headers.range) {
        res.setHeader('retry-after', '1');
        return res.status(425).json({ ok: false, error: 'range_unavailable_during_render', job: publicJob(job) });
      }
      const live = subscribeChapterAudio(job);
      res.status(200);
      res.setHeader('content-type', 'audio/wav');
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-audio-live', 'true');
      return live.pipe(res);
    }
    if (job.status !== 'Finished') {
      return res.status(job.status === 'Cancelled' ? 409 : 500).json({ ok: false, error: job.status === 'Cancelled' ? 'render_cancelled' : 'render_failed', job: publicJob(job) });
    }
    const remote = await getChapterAudioStream(req.app.locals.config, job, req.headers.range);
    if (remote) {
      res.status(remote.status);
      for (const name of ['accept-ranges', 'cache-control', 'content-length', 'content-range', 'content-type', 'etag']) {
        const value = remote.headers.get(name); if (value) res.setHeader(name, value);
      }
      return remote.body ? (await import('node:stream')).Readable.fromWeb(remote.body).pipe(res) : res.end();
    }
    const file = job.storage?.mp3 || job.storage?.wav || job.mp3File || job.file;
    const info = await stat(file);
    const range = req.headers.range;
    res.setHeader('accept-ranges', 'bytes');
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    res.setHeader('content-type', file.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav');
    if (!range) {
      res.setHeader('content-length', info.size);
      return createReadStream(file).pipe(res);
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) { res.setHeader('content-range', `bytes */${info.size}`); return res.status(416).end(); }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) { res.setHeader('content-range', `bytes */${info.size}`); return res.status(416).end(); }
    res.status(206);
    res.setHeader('content-range', `bytes ${start}-${end}/${info.size}`);
    res.setHeader('content-length', end - start + 1);
    return createReadStream(file, { start, end }).pipe(res);
  } catch (error) { next(error); }
}
router.get('/audio/:chapterId/stream', audioStream);
router.get('/audio/stream/:chapterId', audioStream);

router.delete('/audio/cache/:chapterId', async (req, res, next) => {
  try {
    const deleted = await deleteChapterAudio(req.app.locals.config, req.params.chapterId);
    if (!deleted) return res.status(404).json({ ok: false, error: 'audio_not_found' });
    return res.json({ ok: true, chapterId: req.params.chapterId });
  } catch (error) { next(error); }
});

router.post('/audio/retry/:chapterId', async (req, res, next) => {
  try {
    const job = await retryChapterJob(req.app.locals.config, req.params.chapterId);
    if (!job) return res.status(404).json({ ok: false, error: 'audio_not_found' });
    return res.status(202).json(publicJob(job));
  } catch (error) { next(error); }
});
router.get('/chapter-jobs/:id/status', (req, res) => {
  const job = getChapterJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'job_not_found' });
  res.json(publicJob(job));
});
router.post('/chapter-jobs/:id/cancel', (req, res) => {
  const job = cancelChapterJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'job_not_found' });
  res.json(publicJob(job));
});
router.get('/chapter-jobs/:id/download', async (req, res, next) => {
  const job = getChapterJob(req.params.id);
  if (!job?.file || job.status !== 'Finished') return res.status(404).json({ ok: false, error: 'audio_not_found' });
  try { res.setHeader('content-type', 'audio/wav'); res.setHeader('content-disposition', `attachment; filename="${job.fileName}"`); res.send(await import('node:fs/promises').then(({ readFile }) => readFile(job.file))); } catch (error) { next(error); }
});
router.post('/chapter-jobs/:id/open-folder', (req, res) => {
  const job = getChapterJob(req.params.id);
  if (!job?.folder || job.status !== 'Finished') return res.status(404).json({ ok: false, error: 'output_folder_not_found' });
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const lookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], { stdio: 'ignore', windowsHide: true });
  if (lookup.status !== 0) return res.status(503).json({ ok: false, error: 'output_folder_unavailable', message: 'Output folder cannot be opened on this system' });
  const child = spawn(command, [job.folder], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  res.json({ ok: true });
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
