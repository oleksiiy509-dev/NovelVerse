const buckets = new Map();
export function securityHeaders(_req, res, next) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,authorization,accept');
  res.setHeader('access-control-expose-headers', 'x-novelverse-metadata,content-type');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}
export function rateLimiter(cfg) {
  return (req, res, next) => {
    const key = req.socket.remoteAddress || 'local';
    const now = Date.now();
    const bucket = buckets.get(key) || { reset: now + cfg.rateLimitWindowMs, count: 0 };
    if (bucket.reset < now) { bucket.reset = now + cfg.rateLimitWindowMs; bucket.count = 0; }
    bucket.count += 1; buckets.set(key, bucket);
    if (bucket.count > cfg.rateLimitMax) return res.status(429).json({ ok: false, error: 'rate_limited' });
    next();
  };
}
export function requestLogger(cfg) {
  return (req, _res, next) => {
    if (cfg.logLevel !== 'silent') console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
  };
}
