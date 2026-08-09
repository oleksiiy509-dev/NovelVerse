import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { getProvider } from '../providers/index.js';
import { prepareNarratedChapterSegments, prepareNarratedSentences } from '../../src/lib/narrationRendering.js';
import { narratorVoice } from './narration.js';

const jobs = new Map();
const exec = promisify(execFile);
const pending = [];
const chapters = new Map();
let active = false;
let lastError = '';
const stateFiles = new Map();

const fingerprint = ({ language, provider, segments }) => createHash('sha256').update(JSON.stringify({ language, provider, segments })).digest('hex');
const safeName = (value) => String(value || 'Book').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().replace(/[. ]+$/g, '').slice(0, 80) || 'Book';
const chapterName = (number, extension) => `Chapter ${String(Math.max(1, Number(number) || 1)).padStart(4, '0')}.${extension}`;

function mergeWav(buffers) {
  if (buffers.length === 1) return buffers[0];
  const first = Buffer.from(buffers[0]);
  const chunks = buffers.map((buffer) => Buffer.from(buffer).subarray(44));
  const data = Buffer.concat(chunks);
  const output = Buffer.concat([first.subarray(0, 44), data]);
  output.writeUInt32LE(output.length - 8, 4);
  output.writeUInt32LE(data.length, 40);
  return output;
}

async function inspectWav(file, size) {
  const header = Buffer.alloc(44);
  const source = await readFile(file);
  source.copy(header, 0, 0, 44);
  const byteRate = header.readUInt32LE(28) || 1;
  return { size, duration: Number(((size - 44) / byteRate).toFixed(2)) };
}

const metadataFile = (cfg) => path.join(cfg.outputDir, '.audio-metadata.json');
const chapterKey = (cfg, chapterId) => `${cfg.outputDir}\0${chapterId}`;

async function persistMetadata(cfg) {
  const file = metadataFile(cfg);
  const records = [...chapters.values()].filter((job) => job.cfg?.outputDir === cfg.outputDir).map((job) => ({
    id: job.id, key: job.key, request: job.request, status: job.status, completed: job.completed, total: job.total,
    error: job.error, file: job.file, mp3File: job.mp3File, storage: job.storage, size: job.size,
    duration: job.duration, generationTime: job.generationTime, createdAt: job.createdAt,
  }));
  await mkdir(cfg.outputDir, { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1, records }, null, 2));
  await rename(temporary, file);
}

async function loadMetadata(cfg) {
  const file = metadataFile(cfg);
  if (stateFiles.has(file)) return stateFiles.get(file);
  const loading = (async () => {
    try {
      const stored = JSON.parse(await readFile(file, 'utf8'));
      for (const record of stored.records || []) {
        if (!record.request?.chapterId || chapters.has(chapterKey(cfg, record.request.chapterId))) continue;
        const job = { ...record, cfg, cached: record.status === 'Finished', resumed: !['Finished', 'Failed'].includes(record.status), cancelled: false };
        chapters.set(chapterKey(cfg, record.request.chapterId), job);
        jobs.set(job.id, job);
        if (job.resumed) { job.status = 'Preparing'; pending.push(job); }
      }
      runNext();
    } catch { /* the registry is created after the first request */ }
  })();
  stateFiles.set(file, loading);
  return loading;
}

async function uploadAudio(cfg, job) {
  const prefix = path.join(String(job.request.bookId || 'unknown'), String(job.request.chapterId));
  const destination = path.join(cfg.storageDir, prefix);
  await mkdir(destination, { recursive: true });
  const wav = path.join(destination, 'audio.wav');
  await copyFile(job.file, wav);
  let mp3 = null;
  if (job.mp3File) { mp3 = path.join(destination, 'audio.mp3'); await copyFile(job.mp3File, mp3); }
  return { wav, mp3, wavKey: `${prefix}/audio.wav`, mp3Key: mp3 ? `${prefix}/audio.mp3` : null };
}

async function render(job) {
  const started = Date.now();
  const { cfg, request } = job;
  try {
    job.status = 'Preparing';
    const provider = getProvider(request.provider === 'auto' ? 'narrator' : request.provider, cfg);
    const rendered = [];
    job.status = 'Rendering';
    const synthesisSegments = request.chapterTitle ? [...prepareNarratedSentences(request.chapterTitle, { voice: request.voice }), ...request.segments] : request.segments;
    for (let index = 0; index < synthesisSegments.length; index += 1) {
      if (job.cancelled) throw Object.assign(new Error('Generation cancelled'), { cancelled: true });
      const segment = synthesisSegments[index];
      const checkpointDir = path.join(cfg.outputDir, '.render-cache', job.key);
      const checkpoint = path.join(checkpointDir, `${index}.wav`);
      let audio;
      try { audio = await readFile(checkpoint); } catch {
        const result = await provider.synthesize({ text: segment.text, voice: request.voice, language: request.language, format: 'wav', options: { ...segment, voice: request.voice, consistentVoice: true, emotion: String(segment.emotion || 'normal').toLowerCase(), delivery: segment.type || 'narration' } });
        audio = result.audio;
        await mkdir(checkpointDir, { recursive: true });
        await writeFile(checkpoint, audio);
      }
      rendered.push(audio);
      job.completed = Math.min(request.segments.length, index + (request.chapterTitle ? 0 : 1));
      await persistMetadata(cfg);
    }
    job.status = 'Merging';
    const audio = mergeWav(rendered);
    const folder = path.join(cfg.outputDir, safeName(request.bookTitle));
    try { await mkdir(folder, { recursive: true }); } catch { throw new Error('Output folder unavailable'); }
    const wavFile = path.join(folder, chapterName(request.chapterNumber, 'wav'));
    await writeFile(wavFile, audio);
    const details = await inspectWav(wavFile, audio.length);
    let mp3File = null;
    let ffmpegMissing = false;
    try {
      mp3File = path.join(folder, chapterName(request.chapterNumber, 'mp3'));
      await exec(process.env.FFMPEG_BIN || 'ffmpeg', ['-y', '-loglevel', 'error', '-i', wavFile, mp3File], { windowsHide: true });
    } catch (error) {
      mp3File = null;
      if (error.code === 'ENOENT' || error.code === 'EACCES') ffmpegMissing = true;
      else throw new Error(`FFmpeg conversion failed: ${error.message}`);
    }
    const info = await stat(wavFile);
    const manifest = path.join(folder, `.chapter-${String(request.chapterNumber).padStart(4, '0')}.json`);
    await writeFile(manifest, JSON.stringify({ key: job.key, file: wavFile, mp3File, format: 'wav', duration: details.duration }));
    Object.assign(job, { ...details, size: info.size, file: wavFile, mp3File, folder, fileName: path.basename(wavFile), mp3FileName: mp3File && path.basename(mp3File), format: 'wav', ffmpegMissing, generationTime: Date.now() - started, cached: false });
    job.status = 'Uploading';
    job.storage = await uploadAudio(cfg, job);
    job.status = 'Finished';
  } catch (error) {
    job.status = 'Failed';
    job.error = error.cancelled ? 'Generation cancelled' : error.message;
    job.generationTime = Date.now() - started;
    lastError = job.error;
  } finally {
    await persistMetadata(cfg).catch(() => {});
    active = false;
    runNext();
  }
}

export function getChapterQueueStatus() {
  return { busy: active, queued: pending.length, lastError };
}

function runNext() {
  if (active) return;
  const job = pending.shift();
  if (!job) return;
  active = true;
  render(job);
}

export async function createChapterJob(cfg, body = {}) {
  await loadMetadata(cfg);
  const segments = Array.isArray(body.segments) ? body.segments.filter((item) => String(item.text || '').trim()) : [];
  if (!segments.length) throw Object.assign(new Error('segments are required'), { status: 400 });
  const voice = narratorVoice();
  const request = { bookId: body.bookId, chapterId: body.chapterId, chapterNumber: Number(body.chapterNumber) || 1, bookTitle: body.bookTitle, chapterTitle: body.chapterTitle, language: body.language || cfg.defaultLanguage, provider: body.provider || 'narrator', voice, segments: prepareNarratedChapterSegments(segments, { voice, mode: body.narrationMode }) };
  if (!request.chapterId) throw Object.assign(new Error('chapterId is required'), { status: 400 });
  const existing = chapters.get(chapterKey(cfg, request.chapterId));
  if (existing) return publicJob(existing);
  const key = fingerprint(request);
  // Reserve the chapter synchronously before any filesystem await. Concurrent
  // requests then observe this same job rather than enqueueing another render.
  const job = { id: randomUUID(), key, cfg, request, status: 'Preparing', completed: 0, total: segments.length, generationTime: 0, cached: false, createdAt: new Date().toISOString() };
  jobs.set(job.id, job);
  chapters.set(chapterKey(cfg, request.chapterId), job);
  const folder = path.join(cfg.outputDir, safeName(request.bookTitle));
  try { await mkdir(folder, { recursive: true }); } catch { throw Object.assign(new Error('Output folder unavailable'), { status: 503 }); }
  const manifest = path.join(folder, `.chapter-${String(request.chapterNumber).padStart(4, '0')}.json`);
  try {
    const cached = JSON.parse(await readFile(manifest, 'utf8'));
    if (cached.key !== key) throw new Error('cache changed');
    if (cached.format !== 'wav' || path.extname(cached.file).toLowerCase() !== '.wav') throw new Error('legacy cache format');
    const info = await stat(cached.file);
    if (cached.mp3File) await stat(cached.mp3File);
    Object.assign(job, { status: 'Finished', completed: segments.length, file: cached.file, mp3File: cached.mp3File || null, folder, fileName: path.basename(cached.file), mp3FileName: cached.mp3File && path.basename(cached.mp3File), format: 'wav', cached: true, size: info.size, duration: cached.duration });
    await persistMetadata(cfg); return publicJob(job);
  } catch { /* cache miss */ }
  pending.push(job); await persistMetadata(cfg); runNext(); return publicJob(job);
}

export function getChapterJob(id) { return jobs.get(id); }
export async function getChapterAudio(cfg, chapterId) { await loadMetadata(cfg); return chapters.get(chapterKey(cfg, chapterId)); }
export function cancelChapterJob(id) { const job = jobs.get(id); if (job && !['Finished', 'Failed'].includes(job.status)) job.cancelled = true; return job; }
export function publicJob(job) {
  if (!job) return null;
  const { cfg, request, cancelled, file, mp3File, status, error, ...safe } = job;
  const publicStatus = status === 'Finished' ? 'finished' : status === 'Failed' ? 'failed' : 'running';
  const progress = job.total ? Math.min(100, Math.round((job.completed / job.total) * 100)) : 0;
  return {
    ...safe,
    status: publicStatus,
    progress: publicStatus === 'finished' ? 100 : progress,
    ...(publicStatus === 'failed' ? { error } : {}),
    audioUrl: publicStatus === 'finished' ? `/chapter-jobs/${job.id}/download` : null,
  };
}
