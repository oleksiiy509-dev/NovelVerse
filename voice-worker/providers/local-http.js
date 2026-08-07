import { narratorVoice } from '../processors/narration.js';

const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
export function localEndpoint(value) {
  if (!value) return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && localHosts.has(url.hostname) ? url.toString() : null; } catch { return null; }
}

export function localHttpProvider({ id, label, envKey, defaultLanguages = 'en,uk,ru', payload }) {
  const configured = process.env[envKey] || '';
  const endpoint = localEndpoint(configured);
  const available = Boolean(endpoint);
  return { id, label, available, status: { available, configured: Boolean(configured), endpoint, reason: available ? null : configured ? `${envKey} must use a loopback host for offline narration` : `${envKey} is not configured` }, languages: defaultLanguages.split(','), voices: available ? [{ id: narratorVoice(), name: 'NovelVerse Narrator', language: process.env.DEFAULT_LANGUAGE || 'en' }] : [], async synthesize(request) { const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'audio/wav' }, body: JSON.stringify(payload(request)) }); if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status}`); return { audio: Buffer.from(await response.arrayBuffer()), metadata: { provider: id, voice: narratorVoice(), offline: true } }; } };
}
