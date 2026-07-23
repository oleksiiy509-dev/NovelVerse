export const defaultVoiceWorkerUrl = "http://127.0.0.1:8787";
export const defaultPiperVoiceId = "uk_UA-ukrainian_tts-medium";
export const safeVoiceWorkerChunkChars = 2800;

export function getVoiceWorkerToken() {
  return String(import.meta.env?.VITE_VOICE_WORKER_TOKEN || "").trim();
}

function voiceWorkerHeaders(extra = {}) {
  const token = getVoiceWorkerToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export function getVoiceWorkerUrl() {
  return String(import.meta.env?.VITE_VOICE_WORKER_URL || defaultVoiceWorkerUrl).replace(/\/+$/, "");
}

export function parseWorkerMetadata(headers) {
  const encoded = headers?.get?.("x-novelverse-metadata");
  if (!encoded) return null;
  try { return JSON.parse(atob(encoded)); } catch { return null; }
}

async function requestJson(path) {
  const res = await fetch(`${getVoiceWorkerUrl()}${path}`, { headers: voiceWorkerHeaders({ accept: "application/json" }) });
  if (!res.ok) throw Object.assign(new Error(`Voice Worker ${path} returned HTTP ${res.status}`), { status: res.status });
  return res.json();
}

export async function getVoiceWorkerHealth() {
  const health = await requestJson("/health");
  const providers = Array.isArray(health.providers) ? health.providers : [];
  const piper = providers.find((provider) => provider.id === "piper") || null;
  return { ...health, online: true, piperAvailable: Boolean(piper?.available), voices: Array.isArray(health.availableVoices) ? health.availableVoices : [], piper };
}

export async function synthesizeVoiceWorkerAudio({ text, provider = "piper", voice = defaultPiperVoiceId, language = "uk", format = "wav", preview = false, signal, options = {} } = {}) {
  const body = { text: String(text || "").trim(), provider, voice, language, format, options };
  const res = await fetch(`${getVoiceWorkerUrl()}${preview ? "/preview" : "/synthesize"}`, {
    method: "POST",
    headers: voiceWorkerHeaders({ "content-type": "application/json", accept: "audio/*" }),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw Object.assign(new Error(`Voice Worker synthesis failed with HTTP ${res.status}`), { status: res.status });
  const blob = await res.blob();
  return { blob, contentType: res.headers.get("content-type") || blob.type || "audio/wav", metadata: parseWorkerMetadata(res.headers), request: body };
}

export function splitTextForVoiceWorker(text = "", maxChars = safeVoiceWorkerChunkChars) {
  const normalized = String(text).replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?…])\s+/u).filter(Boolean);
    let current = "";
    for (const sentence of sentences.length ? sentences : [paragraph]) {
      if (sentence.length > maxChars) {
        if (current) chunks.push(current.trim());
        for (let i = 0; i < sentence.length; i += maxChars) chunks.push(sentence.slice(i, i + maxChars).trim());
        current = "";
      } else if (`${current}\n${sentence}`.trim().length > maxChars) {
        if (current) chunks.push(current.trim());
        current = sentence;
      } else {
        current = `${current} ${sentence}`.trim();
      }
    }
    if (current) chunks.push(current.trim());
  }
  return chunks;
}
