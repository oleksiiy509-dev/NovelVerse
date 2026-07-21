import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function piperProvider() {
  const available = Boolean(process.env.PIPER_BIN && existsSync(process.env.PIPER_BIN) && process.env.PIPER_MODEL && existsSync(process.env.PIPER_MODEL));
  return { id: 'piper', label: 'Piper', available, languages: ['en', 'uk', 'ru'], voices: [{ id: process.env.PIPER_VOICE || 'piper-default', name: 'Piper local voice', language: 'en' }], synthesize };
}
async function synthesize(req) {
  const out = path.join(os.tmpdir(), `novelverse-piper-${Date.now()}.wav`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.env.PIPER_BIN, ['--model', process.env.PIPER_MODEL, '--output_file', out]);
    child.stdin.end(req.text);
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`piper exited ${code}`)));
  });
  const audio = await readFile(out); await rm(out, { force: true });
  return { audio, metadata: { provider: 'piper' } };
}
