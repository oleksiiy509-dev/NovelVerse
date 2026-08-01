import { timingSafeEqual } from 'node:crypto';

const openPaths = new Set(['/health', '/ready', '/providers']);
const localHosts = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);

function normalizeToken(token) {
  return String(token || '').trim();
}

function tokenMatches(actual, expected) {
  const actualBuffer = Buffer.from(normalizeToken(actual));
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function isLocalDevelopmentToken(token) {
  const normalized = normalizeToken(token);
  return !normalized || normalized === 'change-me';
}

export function isLocalhostRequest(req) {
  const remoteAddress = req.socket?.remoteAddress || req.ip || '';
  if (localHosts.has(remoteAddress)) return true;
  if (remoteAddress.startsWith('::ffff:') && localHosts.has(remoteAddress.slice(7))) return true;

  return false;
}

export function requireBearerToken(cfg) {
  return (req, res, next) => {
    const token = normalizeToken(cfg.token);
    if (openPaths.has(req.path)) return next();
    if (isLocalDevelopmentToken(token) && isLocalhostRequest(req)) return next();
    if (token && tokenMatches(req.headers.authorization, `Bearer ${token}`)) return next();
    return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Voice Worker authentication required. Send Authorization: Bearer <TOKEN>.' });
  };
}
