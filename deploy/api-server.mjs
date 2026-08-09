/* global process, URL, console */
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8080);
const root = join(process.cwd(), 'dist');
const types = { '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

createServer((request, response) => {
  if (request.url === '/health' || request.url === '/ready') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ status: 'ok', service: 'novelverse-api' }));
    return;
  }
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\//, '');
  const candidate = join(root, relative);
  const file = relative && existsSync(candidate) ? candidate : join(root, 'index.html');
  response.writeHead(200, {
    'content-type': types[extname(file)] || 'application/octet-stream',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(file).pipe(response);
}).listen(port, host, () => console.log(JSON.stringify({ level: 'info', message: 'server_started', service: 'novelverse-api', host, port })));
