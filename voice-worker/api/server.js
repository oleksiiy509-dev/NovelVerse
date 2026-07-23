import { createApp } from './app.js';
import { config } from '../utils/config.js';

const app = createApp();
app.listen(config.port, config.host, () => {
  console.log(`NovelVerse local voice worker listening on http://${config.host}:${config.port}`);
});
