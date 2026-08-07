function endpoint(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null; } catch { return null; }
}

export function genericHttpProvider() {
  const url = endpoint(process.env.GENERIC_TTS_URL);
  const healthUrl = endpoint(process.env.GENERIC_TTS_HEALTH_URL || process.env.GENERIC_TTS_URL);
  const reason = url ? null : process.env.GENERIC_TTS_URL ? 'GENERIC_TTS_URL is invalid' : 'GENERIC_TTS_URL is not configured';
  return { id: 'generic-http', label: 'Generic HTTP TTS', available: Boolean(url), status: { available: Boolean(url), reason }, languages: (process.env.GENERIC_TTS_LANGUAGES || 'en').split(','), voices: [], async checkHealth() {
    if (!healthUrl) return { available: false, reason };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(healthUrl, { signal: controller.signal, headers: process.env.GENERIC_TTS_TOKEN ? { authorization: `Bearer ${process.env.GENERIC_TTS_TOKEN}` } : {} });
      return { available: response.status < 500, reason: response.status < 500 ? null : `Generic HTTP health check returned HTTP ${response.status}` };
    } catch (error) {
      return { available: false, reason: error.name === 'AbortError' ? 'Generic HTTP health check timed out' : 'Generic HTTP provider is not reachable' };
    } finally { clearTimeout(timeout); }
  }, synthesize };
}
async function synthesize(req) {
  const res = await fetch(process.env.GENERIC_TTS_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.GENERIC_TTS_TOKEN ? { authorization: `Bearer ${process.env.GENERIC_TTS_TOKEN}` } : {}) }, body: JSON.stringify(req) });
  if (!res.ok) throw new Error(`generic provider failed: ${res.status}`);
  return { audio: Buffer.from(await res.arrayBuffer()), metadata: { provider: 'generic-http' } };
}
