import { requestId } from '../utils/runtime.js';

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
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'camera=(), geolocation=(), microphone=()');
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
    const key = req.socket.remoteAddress || 'local';
    const now = Date.now();
    if (buckets.size > 10_000) {
      for (const [address, candidate] of buckets) if (candidate.reset < now) buckets.delete(address);
    }
    const bucket = buckets.get(key) || { reset: now + cfg.rateLimitWindowMs, count: 0 };
    if (bucket.reset < now) { bucket.reset = now + cfg.rateLimitWindowMs; bucket.count = 0; }
    bucket.count += 1; buckets.set(key, bucket);
    if (bucket.count > cfg.rateLimitMax) { req.app.locals.runtime.metrics.rateLimited += 1; return res.status(429).json({ ok: false, error: 'rate_limited' }); }
    next();
  };
}
export function requestLogger(cfg) {
  return (req, res, next) => {
    const started = Date.now();
    req.id = requestId(req.headers['x-request-id']);
    res.setHeader('x-request-id', req.id);
    req.app.locals.runtime.metrics.requests += 1;
    res.once('finish', () => {
      const durationMs = Date.now() - started;
      const metrics = req.app.locals.runtime.metrics;
      metrics.latencyMs += durationMs;
      if (res.statusCode >= 500) metrics.errors += 1;
      if (cfg.logLevel !== 'silent') console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: res.statusCode >= 500 ? 'error' : 'info', event: 'request_completed', requestId: req.id, method: req.method, path: req.url.split('?')[0], status: res.statusCode, durationMs }));
    });
    next();
  };
}
