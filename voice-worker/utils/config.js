import './load-env.js';
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  token: process.env.TOKEN || process.env.VOICE_WORKER_TOKEN || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  defaultProvider: process.env.DEFAULT_PROVIDER || 'mock',
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
  cacheDir: path.resolve(process.env.VOICE_CACHE_DIR || '.cache/audio'),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),
  queueConcurrency: Number(process.env.QUEUE_CONCURRENCY || 2),
  maxPending: Number(process.env.QUEUE_MAX_PENDING || 50),
  timeoutMs: Number(process.env.JOB_TIMEOUT_MS || 60_000),
  cacheMaxBytes: Number(process.env.CACHE_MAX_BYTES || 2_147_483_648),
  cacheMaxAgeMs: Number(process.env.CACHE_MAX_AGE_MS || 604_800_000),
  shutdownTimeoutMs: Number(process.env.SHUTDOWN_TIMEOUT_MS || 30_000),
};
