import { existsSync } from "node:fs";
export function getProviders() { return [
  { id: "piper", label: "Piper", available: Boolean(process.env.PIPER_BIN && existsSync(process.env.PIPER_BIN) && process.env.PIPER_MODEL), languages: ["uk", "ru", "en"] },
  { id: "generic-http", label: "Generic HTTP TTS", available: Boolean(process.env.GENERIC_TTS_URL), languages: (process.env.GENERIC_TTS_LANGUAGES || "en").split(",") },
  { id: "kokoro", label: "Kokoro (future)", available: false, languages: [] },
  { id: "custom", label: "Custom model (future)", available: false, languages: [] },
]; }
