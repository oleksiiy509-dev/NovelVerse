import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function parse(src) {
  const parsed = {};
  for (const line of String(src).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...parts] = trimmed.split('=');
    parsed[key.trim()] = parts.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
  return parsed;
}

export function config(options = {}) {
  const dotenvPath = options.path || path.resolve(process.cwd(), '.env');
  if (!existsSync(dotenvPath)) return { parsed: {} };
  const parsed = parse(readFileSync(dotenvPath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (options.override || process.env[key] === undefined) process.env[key] = value;
  }
  return { parsed };
}

export default { config, parse };
