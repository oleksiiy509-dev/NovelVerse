export const defaultVoiceWorkerUrl = "http://127.0.0.1:8787";
export const defaultPiperVoiceId = "uk_UA-ukrainian_tts-medium";
export const safeVoiceWorkerChunkChars = 2800;
export const voiceWorkerTimeoutMs = 15000;
export const voiceProviderPriority = ["fish-speech", "kokoro", "piper"];

const providerAliases = { fish: "fish-speech", fishspeech: "fish-speech", "fish_speech": "fish-speech", "generic-http": "fish-speech" };

export function normalizeVoiceProviders(health = {}) {
  const reported = Array.isArray(health.providers) ? health.providers : [];
  return voiceProviderPriority.map((id) => {
    const matching = reported.filter((item) => (providerAliases[String(item.id).toLowerCase()] || String(item.id).toLowerCase()) === id);
    const provider = matching.find((item) => item.available ?? item.online) || matching[0];
    const legacyAvailable = id === "piper" ? health.piperAvailable : id === "kokoro" ? health.kokoroAvailable : health.fishSpeechAvailable;
    return { id, label: id === "fish-speech" ? "Fish Speech" : id[0].toUpperCase() + id.slice(1), ...provider, available: Boolean(provider?.available ?? provider?.online ?? legacyAvailable) };
  });
}

export function selectBestVoiceProvider(health = {}) {
  return normalizeVoiceProviders(health).find((provider) => provider.available)?.id || null;
}

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

async function requestJson(path, timeoutMs = voiceWorkerTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Voice Worker request timed out")), timeoutMs);
  let res;
  try {
    res = await fetch(`${getVoiceWorkerUrl()}${path}`, { headers: voiceWorkerHeaders({ accept: "application/json" }), signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw Object.assign(new Error(`Voice Worker ${path} returned HTTP ${res.status}`), { status: res.status });
  return res.json();
}

async function sendJson(path, body, signal) {
  const res = await fetch(`${getVoiceWorkerUrl()}${path}`, {
    method: "POST",
    headers: voiceWorkerHeaders({ "content-type": "application/json", accept: "application/json" }),
    body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw Object.assign(new Error(`Voice Worker ${path} returned HTTP ${res.status}`), { status: res.status });
  return res.json();
}

export async function getVoiceWorkerHealth() {
  const health = await requestJson("/health");
  const providers = normalizeVoiceProviders(health);
  const piper = providers.find((provider) => provider.id === "piper") || null;
  return {
    ...health,
    online: typeof health.online === "boolean" ? health.online : health.status === "ONLINE" || health.status === "Connected",
    piperAvailable: typeof health.piperAvailable === "boolean" ? health.piperAvailable : piper?.available,
    voices: Array.isArray(health.availableVoices) ? health.availableVoices : [],
    piper,
    providers,
    selectedProvider: selectBestVoiceProvider(health),
  };
}

export const createChapterGeneration = (payload, signal) => sendJson("/chapter-jobs", payload, signal);
export const getChapterGeneration = (id) => requestJson(`/chapter-jobs/${encodeURIComponent(id)}/status`, 30_000);
export const cancelChapterGeneration = (id) => sendJson(`/chapter-jobs/${encodeURIComponent(id)}/cancel`, {});
export const openChapterOutputFolder = (id) => sendJson(`/chapter-jobs/${encodeURIComponent(id)}/open-folder`, {});

export async function getChapterAudio(id) {
  const res = await fetch(`${getVoiceWorkerUrl()}/chapter-jobs/${encodeURIComponent(id)}/download`, { headers: voiceWorkerHeaders({ accept: "audio/wav" }) });
  if (!res.ok) throw Object.assign(new Error(`Voice Worker audio returned HTTP ${res.status}`), { status: res.status });
  return res.blob();
}

export async function synthesizeVoiceWorkerAudio({ text, sourceText, provider = "narrator", voice = defaultPiperVoiceId, language = "uk", format = "wav", preview = false, signal, options = {} } = {}) {
  const normalizedText = String(sourceText || text || "").trim();
  if (!normalizedText) throw new TypeError("Voice Worker text is required");
  const body = { text: normalizedText, sourceText: normalizedText, provider, voice, language, format, options };
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Voice Worker synthesis timed out")), voiceWorkerTimeoutMs);
  let res;
  try {
    res = await fetch(`${getVoiceWorkerUrl()}${preview ? "/preview" : "/synthesize"}`, {
      method: "POST",
      headers: voiceWorkerHeaders({ "content-type": "application/json", accept: "audio/*" }),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
  if (!res.ok) throw Object.assign(new Error(`Voice Worker synthesis failed with HTTP ${res.status}`), { status: res.status });
  const blob = await res.blob();
  return { blob, contentType: res.headers.get("content-type") || blob.type || "audio/wav", metadata: parseWorkerMetadata(res.headers), request: body };
}

export function shouldFallbackToDeviceVoice(error) {
  return error?.name === "AbortError" || error instanceof TypeError || [404, 408, 429, 500, 502, 503, 504].includes(Number(error?.status));
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
