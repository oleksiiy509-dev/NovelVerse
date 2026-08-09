import '../utils/load-env.js';
import { createApp } from './app.js';
import { config } from '../utils/config.js';
import { log } from '../utils/logger.js';

const app = createApp();
app.listen(config.port, config.host, () => {
  log(config, 'info', 'server_started', { host: config.host, port: config.port, provider: config.defaultProvider });
});
