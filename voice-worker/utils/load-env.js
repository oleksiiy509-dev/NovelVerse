import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const workerEnvPath = path.join(workerRoot, '.env');
export const defaultFishSpeechUrl = 'http://127.0.0.1:8080/v1/tts';

export function loadWorkerEnv() {
  // The worker has its own runtime configuration. Make that file authoritative
  // even when the parent process has inherited stale or empty variables.
  const result = dotenv.config({ path: workerEnvPath, override: true });

  // Fish Speech's standard local API needs no host-specific configuration.
  // Make the local installation discoverable when the optional file is absent.
  process.env.FISH_SPEECH_URL ||= defaultFishSpeechUrl;
  process.env.FISH_SPEECH_HEALTH_URL ||= process.env.FISH_SPEECH_URL;

  return result;
}

loadWorkerEnv();
