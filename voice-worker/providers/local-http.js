import { narratorVoice } from '../processors/narration.js';

const localHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const probeCache = new Map();

export function localEndpoint(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && localHosts.has(url.hostname) ? url.toString() : null;
  } catch { return null; }
}

async function reachable(endpoint, timeoutMs) {
  const cached = probeCache.get(endpoint);
  if (cached && Date.now() - cached.checkedAt < 1_000) return cached.available;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let available = false;
  try {
    // Any HTTP response proves that a process is listening. TTS endpoints commonly
    // reject GET with 404/405, which is still a successful discovery signal.
    await fetch(endpoint, { method: 'GET', signal: controller.signal });
    available = true;
  } catch { available = false; }
  finally { clearTimeout(timeout); }
  probeCache.set(endpoint, { available, checkedAt: Date.now() });
  return available;
}

export function clearLocalProviderProbeCache() { probeCache.clear(); }

export function localHttpProvider({ id, label, envKey, defaults = [], defaultLanguages = 'en,uk,ru', payload, responseFormat = 'audio' }) {
  const configured = localEndpoint(process.env[envKey]);
  const candidates = [...new Set([configured, ...defaults.map(localEndpoint)].filter(Boolean))];
  let activeEndpoint = configured || candidates[0] || null;

  async function inspect({ timeoutMs = Number(process.env.LOCAL_TTS_PROBE_TIMEOUT_MS || 350) } = {}) {
    for (const endpoint of candidates) {
      if (await reachable(endpoint, timeoutMs)) {
        activeEndpoint = endpoint;
        return { available: true, endpoint, configured: Boolean(configured), detected: endpoint !== configured, checkedAt: new Date().toISOString(), reason: null };
      }
    }
    return { available: false, endpoint: null, configured: Boolean(configured), detected: false, checkedAt: new Date().toISOString(), reason: `${label} was not detected on a loopback endpoint` };
  }

  return {
    id, label, available: false,
    status: { available: false, endpoint: null, configured: Boolean(configured), candidates },
    languages: defaultLanguages.split(','),
    voices: [{ id: narratorVoice(), name: 'NovelVerse Narrator', language: process.env.DEFAULT_LANGUAGE || 'en' }],
    inspect,
    async synthesize(request) {
      const status = await inspect();
      if (!status.available) throw Object.assign(new Error(status.reason), { code: 'provider_unavailable', status: 503 });
      const response = await fetch(activeEndpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'audio/wav, application/json' }, body: JSON.stringify(payload(request)) });
      if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status}`);
      if (responseFormat === 'json' || response.headers.get('content-type')?.includes('application/json')) {
        const body = await response.json();
        const encoded = body.audio || body.data?.audio || body.data;
        if (typeof encoded !== 'string') throw new Error(`${label} returned no audio`);
        return { audio: Buffer.from(encoded.replace(/^data:audio\/[^;]+;base64,/, ''), 'base64'), metadata: { provider: id, voice: narratorVoice(), offline: true, endpoint: activeEndpoint } };
      }
      return { audio: Buffer.from(await response.arrayBuffer()), metadata: { provider: id, voice: narratorVoice(), offline: true, endpoint: activeEndpoint } };
    },
  };
}
