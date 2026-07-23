import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function getStatus() {
  const binConfigured = Boolean(process.env.PIPER_BIN);
  const modelConfigured = Boolean(process.env.PIPER_MODEL);
  const binExists = binConfigured && existsSync(process.env.PIPER_BIN);
  const modelExists = modelConfigured && existsSync(process.env.PIPER_MODEL);
  const available = Boolean(binExists && modelExists);
  const reason = available ? null : [
    !binConfigured && 'PIPER_BIN is not configured',
    binConfigured && !binExists && 'PIPER_BIN does not exist',
    !modelConfigured && 'PIPER_MODEL is not configured',
    modelConfigured && !modelExists && 'PIPER_MODEL does not exist',
  ].filter(Boolean).join('; ');
  return { available, reason, binConfigured, binExists, modelConfigured, modelExists };
}

export function piperProvider() {
  const status = getStatus();
  return {
    id: 'piper',
    label: 'Piper',
    available: status.available,
    status,
    languages: ['en', 'uk', 'ru'],
    voices: [{ id: process.env.PIPER_VOICE || 'uk_UA-lada-medium', name: 'Piper local voice', language: process.env.DEFAULT_LANGUAGE || 'uk' }],
    synthesize,
  };
}
async function synthesize(req) {
  const out = path.join(os.tmpdir(), `novelverse-piper-${Date.now()}.wav`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.env.PIPER_BIN, ['--model', process.env.PIPER_MODEL, '--output_file', out]);
    child.stdin.end(req.text);
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`piper exited ${code}`)));
  });
  const audio = await readFile(out); await rm(out, { force: true });
  return { audio, metadata: { provider: 'piper', voice: process.env.PIPER_VOICE || 'uk_UA-lada-medium' } };
}
