import { narratorVoice } from '../processors/narration.js';

const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
export function localEndpoint(value) {
  if (!value) return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && localHosts.has(url.hostname) ? url.toString() : null; } catch { return null; }
}

export function localHttpProvider({ id, label, envKey, healthEnvKey, healthFromEndpoint = false, defaultLanguages = 'en,uk,ru', payload }) {
  const configured = process.env[envKey] || '';
  const endpoint = localEndpoint(configured);
  const available = Boolean(endpoint);
  const healthEndpoint = healthFromEndpoint ? endpoint : localEndpoint(process.env[healthEnvKey] || endpoint);
  return { id, label, available, status: { available, configured: Boolean(configured), endpoint, reason: available ? null : configured ? `${envKey} must use a loopback host for offline narration` : `${envKey} is not configured` }, languages: defaultLanguages.split(','), voices: available ? [{ id: narratorVoice(), name: 'NovelVerse Narrator', language: process.env.DEFAULT_LANGUAGE || 'en' }] : [], async checkHealth() {
    if (!healthEndpoint) return { available: false, reason: this.status.reason };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      // Fish Speech has no dedicated health route. GET on its POST-only TTS
      // route returns 405 when ready; a 404 merely identifies a missing route.
      const response = await fetch(healthEndpoint, { method: 'GET', signal: controller.signal });
      const healthy = response.ok || response.status === 405;
      return { available: healthy, reason: healthy ? null : `${label} health check returned HTTP ${response.status}` };
    } catch (error) {
      return { available: false, reason: error.name === 'AbortError' ? `${label} health check timed out` : `${label} is not reachable` };
    } finally { clearTimeout(timeout); }
  }, async synthesize(request) { const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'audio/wav' }, body: JSON.stringify(payload(request)) }); if (!response.ok) throw Object.assign(new Error(`${label} failed: HTTP ${response.status}`), { status: 502, code: 'provider_request_failed' }); return { audio: Buffer.from(await response.arrayBuffer()), metadata: { provider: id, voice: narratorVoice(), offline: true } }; } };
}
