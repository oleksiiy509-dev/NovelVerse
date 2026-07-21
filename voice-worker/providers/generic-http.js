export function genericHttpProvider() {
  const available = Boolean(process.env.GENERIC_TTS_URL);
  return { id: 'generic-http', label: 'Generic HTTP TTS', available, languages: (process.env.GENERIC_TTS_LANGUAGES || 'en').split(','), voices: [], synthesize };
}
async function synthesize(req) {
  const res = await fetch(process.env.GENERIC_TTS_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.GENERIC_TTS_TOKEN ? { authorization: `Bearer ${process.env.GENERIC_TTS_TOKEN}` } : {}) }, body: JSON.stringify(req) });
  if (!res.ok) throw new Error(`generic provider failed: ${res.status}`);
  return { audio: Buffer.from(await res.arrayBuffer()), metadata: { provider: 'generic-http' } };
}
