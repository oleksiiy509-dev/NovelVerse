const buckets = new Map();
const allowedCorsOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]);
const corsMethods = 'GET, POST, OPTIONS';
const corsHeaders = 'Content-Type, Authorization, X-NovelVerse-Token';

function appendVaryOrigin(res) {
  const current = res.getHeader('vary');
  if (!current) {
    res.setHeader('vary', 'Origin');
    return;
  }
  const values = String(current).split(',').map((value) => value.trim().toLowerCase());
  if (!values.includes('origin')) res.setHeader('vary', `${current}, Origin`);
}

export function securityHeaders(req, res, next) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  appendVaryOrigin(res);
  const origin = req.headers.origin;
  if (allowedCorsOrigins.has(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-methods', corsMethods);
    res.setHeader('access-control-allow-headers', corsHeaders);
    res.setHeader('access-control-expose-headers', 'X-NovelVerse-Metadata, Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}
export function rateLimiter(cfg) {
  return (req, res, next) => {
    // Status polling is part of a normal render lifecycle. It must remain
    // observable even when synthesis requests have consumed the request bucket.
    if (req.method === 'GET' && /^\/chapter-jobs\/[^/]+\/status(?:\?|$)/.test(req.url)) return next();
    const key = req.socket.remoteAddress || 'local';
    const now = Date.now();
    const bucket = buckets.get(key) || { reset: now + cfg.rateLimitWindowMs, count: 0 };
    if (bucket.reset < now) { bucket.reset = now + cfg.rateLimitWindowMs; bucket.count = 0; }
    bucket.count += 1; buckets.set(key, bucket);
    if (bucket.count > cfg.rateLimitMax) return res.status(429).json({ ok: false, error: 'rate_limited' });
    next();
  };
}
import { randomUUID } from 'node:crypto';
import { log } from '../utils/logger.js';

export function requestLogger(cfg) {
  return (req, res, next) => {
    const started = performance.now();
    const requestId = req.headers['x-request-id'] || randomUUID();
    res.setHeader('x-request-id', requestId);
    res.on('finish', () => log(cfg, res.statusCode >= 500 ? 'error' : 'info', 'request_completed', {
      requestId, method: req.method, path: req.url.split('?')[0], status: res.statusCode,
      durationMs: Math.round(performance.now() - started),
    }));
    next();
  };
}
