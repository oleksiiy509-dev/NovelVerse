export function notFound(_req, res) { res.status(404).json({ ok: false, error: 'not_found' }); }
export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const message = status >= 500 && !err.code ? 'Internal server error' : err.message;
  res.status(status).json({ ok: false, error: err.code || 'internal_error', message, requestId: req.id });
}
