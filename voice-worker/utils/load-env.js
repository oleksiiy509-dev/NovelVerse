import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const workerEnvPath = path.join(workerRoot, '.env');

export function loadWorkerEnv() {
  return dotenv.config({ path: workerEnvPath, override: false });
}

loadWorkerEnv();
