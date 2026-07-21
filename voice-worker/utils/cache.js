import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function cacheKey(payload) { return createHash('sha256').update(JSON.stringify(payload)).digest('hex'); }
export async function putCachedAudio(cfg, payload, buffer, format) {
  await mkdir(cfg.cacheDir, { recursive: true });
  const key = cacheKey({ ...payload, format });
  const file = path.join(cfg.cacheDir, `${key}.${format}`);
  let hit = false;
  try { await stat(file); hit = true; } catch { await writeFile(file, buffer); }
  return { key, file, hit };
}
