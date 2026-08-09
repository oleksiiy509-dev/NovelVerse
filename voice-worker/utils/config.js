import './load-env.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  token: process.env.TOKEN || process.env.VOICE_WORKER_TOKEN || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  defaultProvider: process.env.DEFAULT_PROVIDER || 'narrator',
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
  cacheDir: path.resolve(process.env.VOICE_CACHE_DIR || '.cache/audio'),
  outputDir: path.resolve(process.env.VOICE_OUTPUT_DIR || path.join(repoRoot, 'voice-output')),
  storageDir: path.resolve(process.env.AUDIO_STORAGE_DIR || path.join(repoRoot, 'voice-storage')),
  publicAudioBaseUrl: process.env.PUBLIC_AUDIO_BASE_URL || '',
  chapterSourceUrl: process.env.CHAPTER_SOURCE_URL || '',
  chapterSourceToken: process.env.CHAPTER_SOURCE_TOKEN || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  r2Endpoint: process.env.R2_ENDPOINT || '',
  r2Bucket: process.env.R2_BUCKET || '',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),
};
