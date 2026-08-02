import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { getProvider } from '../providers/index.js';

const jobs = new Map();
const exec = promisify(execFile);
const pending = [];
let active = false;
let lastError = '';

const fingerprint = ({ language, segments }) => createHash('sha256').update(JSON.stringify({ language, segments })).digest('hex');
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

async function render(job) {
  const started = Date.now();
  const { cfg, request } = job;
  try {
    job.status = 'Preparing';
    const provider = getProvider('piper', cfg);
    if (!provider.available) throw new Error(provider.status?.reason || 'Piper is unavailable');
    const rendered = [];
    job.status = 'Rendering';
    for (let index = 0; index < request.segments.length; index += 1) {
      if (job.cancelled) throw Object.assign(new Error('Generation cancelled'), { cancelled: true });
      const segment = request.segments[index];
      const result = await provider.synthesize({ text: segment.text, language: request.language, format: 'wav', options: { emotion: String(segment.emotion || 'normal').toLowerCase(), rate: segment.rate, pitch: segment.pitch } });
      rendered.push(result.audio);
      job.completed = index + 1;
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
    Object.assign(job, { ...details, size: info.size, status: 'Finished', file: wavFile, mp3File, folder, fileName: path.basename(wavFile), mp3FileName: mp3File && path.basename(mp3File), format: 'wav', ffmpegMissing, generationTime: Date.now() - started, cached: false });
  } catch (error) {
    job.status = 'Failed';
    job.error = error.cancelled ? 'Generation cancelled' : error.message;
    job.generationTime = Date.now() - started;
    lastError = job.error;
  } finally {
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
  const segments = Array.isArray(body.segments) ? body.segments.filter((item) => String(item.text || '').trim()) : [];
  if (!segments.length) throw Object.assign(new Error('segments are required'), { status: 400 });
  const request = { bookId: body.bookId, chapterId: body.chapterId, chapterNumber: Number(body.chapterNumber) || 1, bookTitle: body.bookTitle, chapterTitle: body.chapterTitle, language: body.language || cfg.defaultLanguage, segments: segments.map(({ text, voice, emotion, rate, pitch }) => ({ text: String(text).trim(), voice, emotion, rate, pitch })) };
  const key = fingerprint(request);
  const folder = path.join(cfg.outputDir, safeName(request.bookTitle));
  try { await mkdir(folder, { recursive: true }); } catch { throw Object.assign(new Error('Output folder unavailable'), { status: 503 }); }
  const manifest = path.join(folder, `.chapter-${String(request.chapterNumber).padStart(4, '0')}.json`);
  try {
    const cached = JSON.parse(await readFile(manifest, 'utf8'));
    if (cached.key !== key) throw new Error('cache changed');
    if (cached.format !== 'wav' || path.extname(cached.file).toLowerCase() !== '.wav') throw new Error('legacy cache format');
    const info = await stat(cached.file);
    if (cached.mp3File) await stat(cached.mp3File);
    const job = { id: randomUUID(), key, request, status: 'Finished', completed: segments.length, total: segments.length, file: cached.file, mp3File: cached.mp3File || null, folder, fileName: path.basename(cached.file), mp3FileName: cached.mp3File && path.basename(cached.mp3File), format: 'wav', generationTime: 0, cached: true, size: info.size, duration: cached.duration };
    jobs.set(job.id, job); return publicJob(job);
  } catch { /* cache miss */ }
  const job = { id: randomUUID(), key, cfg, request, status: 'Preparing', completed: 0, total: segments.length, generationTime: 0, cached: false };
  jobs.set(job.id, job); pending.push(job); runNext(); return publicJob(job);
}

export function getChapterJob(id) { return jobs.get(id); }
export function cancelChapterJob(id) { const job = jobs.get(id); if (job && !['Finished', 'Failed'].includes(job.status)) job.cancelled = true; return job; }
export function publicJob(job) { if (!job) return null; const { cfg, request, cancelled, file, mp3File, ...safe } = job; return { ...safe, audioUrl: job.status === 'Finished' ? `/chapter-jobs/${job.id}/download` : null }; }
