import '../utils/load-env.js';
import express from 'express';
import { config } from '../utils/config.js';
import { errorHandler, notFound } from '../middleware/errors.js';
import { requireBearerToken } from '../middleware/auth.js';
import { requestLogger, rateLimiter, securityHeaders } from '../middleware/security.js';
import { router } from '../routes/index.js';
import { createRuntime } from '../utils/runtime.js';

export function createApp(overrides = {}) {
  const cfg = { ...config, ...overrides };
  const app = express();
  app.locals.config = cfg;
  app.locals.runtime = createRuntime(cfg);
  app.use(securityHeaders);
  app.use(express.json({ limit: '2mb' }));
  app.use(rateLimiter(cfg));
  app.use(requestLogger(cfg));
  app.use(requireBearerToken(cfg));
  app.use(router);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
