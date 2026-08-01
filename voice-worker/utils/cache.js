import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function cacheKey(payload) { return createHash('sha256').update(JSON.stringify(payload)).digest('hex'); }
export async function putCachedAudio(cfg, payload, buffer, format) {
  await mkdir(cfg.cacheDir, { recursive: true });
  const key = cacheKey({ ...payload, format });
  const file = path.join(cfg.cacheDir, `${key}.${format}`);
  let hit = false;
  try { await stat(file); hit = true; } catch {
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, buffer, { flag: 'wx' });
    await rename(temporary, file).catch(async (error) => { await unlink(temporary).catch(() => {}); if (error.code !== 'EEXIST') throw error; });
  }
  return { key, file, hit };
}

export async function getCachedAudio(cfg, payload, format) {
  const key = cacheKey({ ...payload, format });
  const file = path.join(cfg.cacheDir, `${key}.${format}`);
  try { return { key, file, hit: true, audio: await readFile(file) }; } catch (error) { if (error.code !== 'ENOENT') throw error; return { key, file, hit: false }; }
}

export async function pruneCache(cfg) {
  await mkdir(cfg.cacheDir, { recursive: true });
  const now = Date.now();
  const entries = (await readdir(cfg.cacheDir, { withFileTypes: true })).filter((entry) => entry.isFile());
  const files = await Promise.all(entries.map(async (entry) => ({ name: entry.name, ...(await stat(path.join(cfg.cacheDir, entry.name))) })));
  let bytes = files.reduce((sum, file) => sum + file.size, 0);
  let removed = 0;
  for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    if (now - file.mtimeMs <= cfg.cacheMaxAgeMs && bytes <= cfg.cacheMaxBytes) continue;
    await unlink(path.join(cfg.cacheDir, file.name)).catch(() => {});
    bytes -= file.size; removed += 1;
  }
  return { files: files.length - removed, bytes: Math.max(0, bytes), removed };
}
