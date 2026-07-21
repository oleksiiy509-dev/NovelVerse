export function notFound(_req, res) { res.status(404).json({ ok: false, error: 'not_found' }); }
export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  res.status(status).json({ ok: false, error: err.code || 'internal_error', message: err.message });
}
