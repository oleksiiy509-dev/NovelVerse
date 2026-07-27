import '../utils/load-env.js';
import { createApp } from './app.js';
import { config } from '../utils/config.js';
import { pruneCache } from '../utils/cache.js';

const app = createApp();
await pruneCache(config).catch((error) => console.error(JSON.stringify({ level: 'error', event: 'cache_prune_failed', message: error.message })));
const server = app.listen(config.port, config.host, () => {
  console.log(JSON.stringify({ level: 'info', event: 'worker_started', host: config.host, port: config.port, pid: process.pid }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', event: 'shutdown_started', signal }));
  app.locals.runtime.queue.stop();
  server.close((error) => { process.exitCode = error ? 1 : 0; });
  setTimeout(() => { console.error(JSON.stringify({ level: 'error', event: 'shutdown_forced' })); process.exit(1); }, config.shutdownTimeoutMs).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
