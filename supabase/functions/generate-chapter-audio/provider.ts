export type AudioProviderId = string;
export type AudioFormat = "mp3";

export type DirectorPerformance = { confidence?: number; breathiness?: number; roughness?: number; voiceAge?: string; sceneMood?: string; deliveryStyle?: string };
export type AudioRenderSegmentRequest = { segmentId: string; text: string; language: string; speaker: string; castSlot: string; voiceProfile: string; emotion: string; intensity: number; pace: number; pauses: { beforeMs: number; afterMs: number }; emphasis: string[]; format: AudioFormat; performance?: DirectorPerformance };
export type AudioProvider = { id: AudioProviderId; version: string; contentType: string; maxInputChars: number; renderSegment(request: AudioRenderSegmentRequest): Promise<Uint8Array>; estimateDurationSeconds?(request: AudioRenderSegmentRequest, audio: Uint8Array): number; };
export type SpeechRequest = { text: string; language: string; voice: string; format: AudioFormat };
export type SpeechResult = { ok: true; audio: Uint8Array; contentType: string; durationSeconds?: number } | { ok: false; code: "provider_not_configured" | "provider_auth_missing" | "provider_timeout" | "provider_rate_limited" | "provider_bad_request" | "provider_error"; message: string };

const OPENAI_TTS_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"]);
const DEFAULT_OPENAI_VOICE_MAP: Record<string, string> = { narrator: "alloy", narrator_neutral: "alloy", young_male: "echo", mature_male: "onyx", elderly_male: "onyx", young_female: "nova", mature_female: "shimmer", elderly_female: "sage", child: "fable", monster: "onyx", unknown: "alloy", unknown_neutral: "alloy" };

function env(name: string, fallback = "") { return Deno.env.get(name) || fallback; }
function configured(name: string) { return Boolean(Deno.env.get(name)?.trim()); }
function providerResolution(provider: unknown) {
  const explicit = String(provider ?? "").trim();
  const primary = env("NOVELVERSE_TTS_PROVIDER");
  const requested = explicit || primary || "piper";
  return {
    requested_provider: requested,
    resolution_source: explicit ? "request" : primary ? "NOVELVERSE_TTS_PROVIDER" : "default",
    selected_provider: resolveProviderId(requested),
  };
}
export function getProviderDiagnostics(providerId?: unknown) {
  const resolution = providerResolution(providerId);
  const selectedModel = env("NOVELVERSE_TTS_MODEL", resolution.selected_provider === "openai" ? "gpt-4o-mini-tts" : "default");
  const requiredEnvironmentVariables = resolution.selected_provider === "openai" ? ["OPENAI_API_KEY"] : resolution.selected_provider === "piper" ? ["NOVELVERSE_PIPER_URL"] : [];
  const missingEnvironmentVariables = requiredEnvironmentVariables.filter((name) => !configured(name));
  return {
    ...resolution,
    selected_model: selectedModel,
    provider_configuration: resolution.selected_provider === "openai" ? {
      api_key_configured: configured("OPENAI_API_KEY"), model: selectedModel,
      default_voice: env("NOVELVERSE_TTS_DEFAULT_VOICE", "alloy"),
      timeout_ms: Number(env("NOVELVERSE_TTS_TIMEOUT_MS", "45000")), retry_count: Number(env("NOVELVERSE_TTS_RETRY_COUNT", "2")),
    } : resolution.selected_provider === "piper" ? {
      worker_url: piperWorkerUrl(), worker_url_configured: configured("NOVELVERSE_PIPER_URL"),
      token_configured: configured("NOVELVERSE_PIPER_TOKEN"), timeout_ms: Number(env("NOVELVERSE_TTS_TIMEOUT_MS", "45000")),
      health_timeout_ms: Number(env("NOVELVERSE_PIPER_HEALTH_TIMEOUT_MS", "2000")),
    } : { adapter: resolution.selected_provider },
    required_environment_variables: requiredEnvironmentVariables,
    missing_environment_variables: missingEnvironmentVariables,
    missing_configuration: missingEnvironmentVariables.map((name) => `${name} is not set`),
  };
}
function parseVoiceMap(provider: string) { try { return { ...DEFAULT_OPENAI_VOICE_MAP, ...JSON.parse(env(`NOVELVERSE_TTS_${provider.toUpperCase()}_VOICE_MAP`, "{}")) }; } catch { console.warn(`NovelVerse TTS ${provider} voice map is invalid JSON; using defaults.`); return DEFAULT_OPENAI_VOICE_MAP; } }
export function resolveOpenAiVoice(request: Pick<AudioRenderSegmentRequest, "castSlot" | "voiceProfile">, configuredDefault = env("NOVELVERSE_TTS_DEFAULT_VOICE", "alloy")) { const map = parseVoiceMap("openai"); const candidates = [request.castSlot, request.voiceProfile, String(request.voiceProfile || "").replace(/_neutral$/, ""), "unknown", configuredDefault].filter(Boolean); const selected = candidates.map((key) => map[key] || key).find((voice) => OPENAI_TTS_VOICES.has(voice)); if (!selected) throw new Error("No supported OpenAI TTS voice is configured."); const exact = Boolean(map[request.castSlot] || map[request.voiceProfile] || OPENAI_TTS_VOICES.has(request.castSlot) || OPENAI_TTS_VOICES.has(request.voiceProfile)); if (!exact) console.warn(`NovelVerse TTS voice fallback used for cast slot ${request.castSlot || "unknown"}.`); return { voice: selected, fallback: !exact }; }
export function buildOpenAiInstructions(request: AudioRenderSegmentRequest) { const p = request.performance || {}; return [`Language: ${request.language || "auto"}.`, `Speaker identity: ${request.speaker || "Narrator"}; keep it consistent for cast slot ${request.castSlot || "unknown"}.`, `Emotion: ${request.emotion || "neutral"}; intensity ${Math.max(0, Math.min(1, Number(request.intensity) || 0)).toFixed(2)}.`, `Pace multiplier: ${Math.max(0.25, Math.min(4, Number(request.pace) || 1)).toFixed(2)}.`, p.confidence !== undefined ? `Confidence: ${p.confidence}.` : "", p.breathiness !== undefined ? `Breathiness: ${p.breathiness}.` : "", p.roughness !== undefined ? `Roughness: ${p.roughness}.` : "", p.voiceAge ? `Voice age: ${p.voiceAge}.` : "", p.sceneMood ? `Scene mood: ${p.sceneMood}.` : "", request.emphasis?.length ? `Emphasize without spelling out markup: ${request.emphasis.join(", ")}.` : ""].filter(Boolean).join(" "); }

class UnconfiguredAudioProvider implements AudioProvider { id = "unconfigured"; version = "mock-deterministic-v1"; contentType = "audio/mpeg"; maxInputChars = 4096; async renderSegment(request: AudioRenderSegmentRequest) { const seed = new TextEncoder().encode(`NovelVerse mock MP3 ${request.segmentId}:${request.text}`); return seed.byteLength ? seed : new Uint8Array([73, 68, 51]); } estimateDurationSeconds(request: AudioRenderSegmentRequest) { return Math.max(1, Math.round((request.text.split(/\s+/).filter(Boolean).length / 155) * 60)); } }

class OpenAiTtsProvider implements AudioProvider { id = "openai"; version = "openai-tts-v1"; contentType = "audio/mpeg"; maxInputChars = Number(env("NOVELVERSE_TTS_PROVIDER_MAX_INPUT_CHARS", "4096")); async renderSegment(request: AudioRenderSegmentRequest) { const apiKey = env("OPENAI_API_KEY"); if (!apiKey) throw Object.assign(new Error("OPENAI_API_KEY is required in Supabase Edge Function secrets."), { code: "provider_auth_missing" }); const model = env("NOVELVERSE_TTS_MODEL", "gpt-4o-mini-tts"); const { voice } = resolveOpenAiVoice(request); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), Number(env("NOVELVERSE_TTS_TIMEOUT_MS", "45000"))); const payload = { model, voice, input: request.text, response_format: request.format || "mp3", speed: Math.max(0.25, Math.min(4, Number(request.pace) || 1)), instructions: buildOpenAiInstructions(request) }; try { const attempts = Math.max(1, Number(env("NOVELVERSE_TTS_RETRY_COUNT", "2")) + 1); let last: Error | null = null; for (let attempt = 1; attempt <= attempts; attempt += 1) { const res = await fetch("https://api.openai.com/v1/audio/speech", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal }); if (res.ok) return new Uint8Array(await res.arrayBuffer()); const body = await res.text().catch(() => ""); const code = res.status === 429 ? "provider_rate_limited" : res.status === 400 ? "provider_bad_request" : "provider_error"; last = Object.assign(new Error(`${code}: OpenAI TTS request failed with HTTP ${res.status}`), { code }); console.warn(JSON.stringify({ status: "provider_error", provider: "openai", http_status: res.status, error_code: code, response_excerpt_length: body.length })); if (res.status < 500 && res.status !== 429) break; await new Promise((r) => setTimeout(r, 250 * attempt)); } throw last || new Error("provider_error: OpenAI TTS failed."); } catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw Object.assign(new Error("provider_timeout: OpenAI TTS request timed out."), { code: "provider_timeout" }); throw error; } finally { clearTimeout(timeout); } } estimateDurationSeconds(request: AudioRenderSegmentRequest) { return Math.max(1, Math.round((request.text.split(/\s+/).filter(Boolean).length / (155 * (Number(request.pace) || 1))) * 60)); } }

const piperWorkerUrl = () => env("NOVELVERSE_PIPER_URL", "http://127.0.0.1:8787").replace(/\/+$/, "");
function piperHeaders(contentType?: string) { const token = env("NOVELVERSE_PIPER_TOKEN"); return { ...(contentType ? { "Content-Type": contentType } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }; }
export async function isPiperAvailable() { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), Number(env("NOVELVERSE_PIPER_HEALTH_TIMEOUT_MS", "2000"))); try { const response = await fetch(`${piperWorkerUrl()}/health`, { headers: piperHeaders(), signal: controller.signal }); if (!response.ok) return false; const health = await response.json(); return Array.isArray(health?.providers) && health.providers.some((provider: any) => provider?.id === "piper" && provider?.available === true); } catch { return false; } finally { clearTimeout(timeout); } }
class PiperTtsProvider implements AudioProvider { id = "piper"; version = "piper-worker-v1"; contentType = "audio/mpeg"; maxInputChars = Number(env("NOVELVERSE_TTS_PROVIDER_MAX_INPUT_CHARS", "4096")); async renderSegment(request: AudioRenderSegmentRequest) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), Number(env("NOVELVERSE_TTS_TIMEOUT_MS", "45000"))); try { const response = await fetch(`${piperWorkerUrl()}/synthesize`, { method: "POST", headers: piperHeaders("application/json"), body: JSON.stringify({ text: request.text, provider: "piper", voice: request.voiceProfile || request.castSlot, language: request.language, format: request.format, options: { pace: request.pace, emotion: request.emotion, intensity: request.intensity, speaker: request.speaker } }), signal: controller.signal }); if (!response.ok) throw Object.assign(new Error(`Piper worker returned HTTP ${response.status}.`), { code: response.status === 429 ? "provider_rate_limited" : "provider_error" }); return new Uint8Array(await response.arrayBuffer()); } catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw Object.assign(new Error("Piper worker timed out."), { code: "provider_timeout" }); throw error; } finally { clearTimeout(timeout); } } estimateDurationSeconds(request: AudioRenderSegmentRequest) { return Math.max(1, Math.round((request.text.split(/\s+/).filter(Boolean).length / (155 * (Number(request.pace) || 1))) * 60)); } }
export async function resolveDefaultProvider() { return "piper"; }

const providers = new Map<string, AudioProvider>(); providers.set("unconfigured", new UnconfiguredAudioProvider()); providers.set("mock", providers.get("unconfigured")!); providers.set("openai", new OpenAiTtsProvider());
export function registerAudioProvider(provider: AudioProvider) { if (!provider?.id || !provider?.version || typeof provider.renderSegment !== "function") throw new Error("Invalid audio provider adapter."); providers.set(provider.id, provider); }
export function getAudioProvider(providerId = env("NOVELVERSE_TTS_PROVIDER", "piper")) { const selected = resolveProviderId(providerId); if (selected === "piper") return providers.get("piper") || new PiperTtsProvider(); return providers.get(selected) || providers.get("unconfigured")!; }
export async function renderAudioSegment(providerId: string, request: AudioRenderSegmentRequest): Promise<SpeechResult & { provider: string; providerVersion: string }> { const provider = getAudioProvider(providerId); try { const audio = await provider.renderSegment(request); return { ok: true, audio, contentType: provider.contentType, durationSeconds: provider.estimateDurationSeconds?.(request, audio), provider: provider.id, providerVersion: provider.version }; } catch (error) { const code = (error as any)?.code || (provider.id === "unconfigured" ? "provider_not_configured" : "provider_error"); const message = error instanceof Error ? error.message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]") : "Audio provider failed."; const stack = error instanceof Error ? error.stack || null : new Error(message).stack || null; console.error(JSON.stringify({ status: "provider_initialization_failed", error_code: code, ...getProviderDiagnostics(providerId), provider_adapter: provider.id, provider_version: provider.version, provider_initialization_error: message, original_exception: error instanceof Error ? { name: error.name, message } : String(error), stack_trace: stack })); return { ok: false, code, message, provider: provider.id, providerVersion: provider.version }; } }
export async function generateSpeech(request: SpeechRequest): Promise<SpeechResult> { return renderAudioSegment(resolveProviderId(env("NOVELVERSE_TTS_PROVIDER") || await resolveDefaultProvider()), { segmentId: "legacy", text: request.text, language: request.language, speaker: "Narrator", castSlot: request.voice, voiceProfile: request.voice, emotion: "neutral", intensity: 0.5, pace: 1, pauses: { beforeMs: 0, afterMs: 0 }, emphasis: [], format: request.format }); }

export const supportedProviderIds = ["mock", "piper", "openai"];
export const acceptedProviderValues = ["default", "auto", ...supportedProviderIds];
export function resolveProviderId(provider: unknown) {
  const requested = String(provider ?? "").trim().toLowerCase();
  return !requested || requested === "default" || requested === "auto" ? "piper" : requested;
}
export const supportedVoices = Array.from(OPENAI_TTS_VOICES);

export function normalizeProviderError(error: unknown) {
  const rawCode = String((error as any)?.code || "provider_error");
  const map: Record<string, { code: string; message: string; status: number }> = {
    provider_auth_missing: { code: "TTS_API_KEY_MISSING", message: "The TTS provider credentials are missing on the server.", status: 500 },
    provider_timeout: { code: "TTS_PROVIDER_UNAVAILABLE", message: "The TTS provider timed out. Try again later.", status: 504 },
    provider_rate_limited: { code: "TTS_RATE_LIMITED", message: "The TTS provider is rate limited. Try again later.", status: 429 },
    provider_bad_request: { code: "TTS_PROVIDER_REJECTED_REQUEST", message: "The TTS provider rejected the preview request. Check the voice and text length.", status: 400 },
    provider_not_configured: { code: "TTS_PROVIDER_NOT_CONFIGURED", message: "The TTS provider is not configured on the server.", status: 501 },
    piper_unavailable_no_fallback: { code: "TTS_PROVIDER_UNAVAILABLE", message: "Piper is unavailable and no OpenAI provider is configured.", status: 503 },
    storage_upload_failed: { code: "STORAGE_UPLOAD_FAILED", message: "Audio was generated but could not be stored.", status: 500 },
    signed_url_failed: { code: "SIGNED_URL_FAILED", message: "Audio was stored but a signed playback URL could not be created.", status: 500 },
  };
  return map[rawCode] || { code: "TTS_PROVIDER_UNAVAILABLE", message: "The TTS provider is temporarily unavailable.", status: 502 };
}
