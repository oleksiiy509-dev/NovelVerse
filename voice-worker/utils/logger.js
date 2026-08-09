const priorities = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export function log(cfg, level, message, fields = {}) {
  if ((priorities[level] || 20) < (priorities[cfg.logLevel] || 20)) return;
  const record = { timestamp: new Date().toISOString(), level, message, service: 'novelverse-voice-worker', ...fields };
  const output = process.env.LOG_FORMAT === 'pretty' ? `${record.timestamp} ${level.toUpperCase()} ${message} ${JSON.stringify(fields)}` : JSON.stringify(record);
  (level === 'error' ? console.error : console.log)(output);
}
