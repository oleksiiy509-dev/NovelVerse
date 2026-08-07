const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);

export function localEndpoint(value, fallback) {
  try {
    const url = new URL(value || fallback);
    return loopbackHosts.has(url.hostname) ? url.toString() : '';
  } catch { return ''; }
}

export async function postLocalAudio(url, payload, provider) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`${provider} failed: ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const body = await response.json();
    const encoded = body.audio || body.audio_data || body.data;
    if (typeof encoded !== 'string') throw new Error(`${provider} returned no audio`);
    return Buffer.from(encoded, 'base64');
  }
  return Buffer.from(await response.arrayBuffer());
}
