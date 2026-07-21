const openPaths = new Set(['/health']);

export function requireBearerToken(cfg) {
  return (req, res, next) => {
    if (!cfg.token || openPaths.has(req.path)) return next();
    if (req.headers.authorization === `Bearer ${cfg.token}`) return next();
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  };
}
