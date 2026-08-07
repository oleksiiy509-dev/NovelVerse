import './load-env.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  token: process.env.TOKEN || process.env.VOICE_WORKER_TOKEN || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  defaultProvider: process.env.DEFAULT_PROVIDER || 'fish-speech',
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
  cacheDir: path.resolve(process.env.VOICE_CACHE_DIR || '.cache/audio'),
  outputDir: path.resolve(process.env.VOICE_OUTPUT_DIR || path.join(repoRoot, 'voice-output')),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),
};
