import http from 'node:http';

function enhance(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
  res.send = (body) => { if (Buffer.isBuffer(body)) return res.end(body); if (typeof body === 'object') return res.json(body); res.end(String(body)); };
}
function match(layer, req) {
  if (layer.method !== 'USE' && layer.method !== req.method) return false;
  if (layer.path === '*') return true;
  const names = [];
  const pattern = layer.path.split('/').map((part) => {
    if (!part.startsWith(':')) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    names.push(part.slice(1)); return '([^/]+)';
  }).join('/');
  const matched = new RegExp(`^${pattern}$`).exec(req.path);
  if (!matched) return false;
  req.params = Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(matched[index + 1])]));
  return true;
}
function createApp() {
  const layers = [];
  const app = (req, res) => {
    enhance(res); req.path = req.url.split('?')[0]; req.params = {}; req.app = app;
    let i = 0;
    const next = (err) => {
      const layer = layers[i++];
      if (!layer) return err ? res.status(500).json({ ok: false, error: 'internal_error', message: err.message }) : res.status(404).json({ ok: false, error: 'not_found' });
      if (!match(layer, req)) return next(err);
      try {
        if (err && layer.handler.length === 4) return layer.handler(err, req, res, next);
        if (!err && layer.handler.length < 4) return layer.handler(req, res, next);
        return next(err);
      } catch (caught) { return next(caught); }
    };
    next();
  };
  app.locals = {};
  app.use = (handler) => { if (handler?.__layers) layers.push(...handler.__layers); else layers.push({ method: 'USE', path: '*', handler }); return app; };
  for (const method of ['GET', 'POST', 'DELETE']) app[method.toLowerCase()] = (path, handler) => { layers.push({ method, path, handler }); return app; };
  app.listen = (...args) => http.createServer(app).listen(...args);
  return app;
}
function Router() { const r = createApp(); r.__layers = []; for (const method of ['get', 'post', 'delete', 'use']) r[method] = (...args) => { const path = typeof args[0] === 'string' ? args[0] : '*'; const handler = typeof args[0] === 'string' ? args[1] : args[0]; r.__layers.push({ method: method === 'use' ? 'USE' : method.toUpperCase(), path, handler }); return r; }; return r; }
createApp.Router = Router;
createApp.json = ({ limit } = {}) => async (req, _res, next) => { if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next(); const chunks = []; for await (const c of req) chunks.push(c); req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; next(); };
export { Router };
export default createApp;
