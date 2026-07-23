import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { workerRoot } from '../utils/load-env.js';

function cleanEnvPath(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function resolveConfiguredPath(value) {
  const cleaned = cleanEnvPath(value);
  if (!cleaned) return '';
  return path.isAbsolute(cleaned) ? cleaned : path.resolve(workerRoot, cleaned);
}


const emotionPresets = {
  calm: { rate: 0.8, pitch: 0.9, pauseLength: 1.2 },
  normal: { rate: 0.85, pitch: 1, pauseLength: 1 },
  dramatic: { rate: 0.75, pitch: 1.15, pauseLength: 1.35 },
  whisper: { rate: 0.65, pitch: 0.75, pauseLength: 1.5 },
};

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function getNarrationOptions(options = {}) {
  const preset = emotionPresets[options.emotion] || emotionPresets.normal;
  return {
    emotion: emotionPresets[options.emotion] ? options.emotion : 'normal',
    rate: clampNumber(options.rate, preset.rate, 0.5, 3),
    pitch: clampNumber(options.pitch, preset.pitch, 0, 2),
    pauseLength: clampNumber(options.pauseLength, preset.pauseLength, 0, 2.5),
    sentencePause: clampNumber(options.sentencePause, 250, 0, 3000),
    paragraphPause: clampNumber(options.paragraphPause, 700, 0, 6000),
  };
}

function prepareText(text, options) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join(`\n${'.'.repeat(Math.max(1, Math.round(options.paragraphPause / Math.max(1, options.sentencePause || 250))))} `);
}

function getStatus() {
  const binPath = resolveConfiguredPath(process.env.PIPER_BIN);
  const modelPath = resolveConfiguredPath(process.env.PIPER_MODEL);
  const binConfigured = Boolean(binPath);
  const modelConfigured = Boolean(modelPath);
  const binExists = binConfigured && existsSync(binPath);
  const modelExists = modelConfigured && existsSync(modelPath);
  const available = Boolean(binExists && modelExists);
  const reason = available ? null : [
    !binConfigured && 'PIPER_BIN is not configured',
    binConfigured && !binExists && `PIPER_BIN does not exist: ${binPath}`,
    !modelConfigured && 'PIPER_MODEL is not configured',
    modelConfigured && !modelExists && `PIPER_MODEL does not exist: ${modelPath}`,
  ].filter(Boolean).join('; ');
  return { available, reason, binConfigured, binExists, binPath, modelConfigured, modelExists, modelPath };
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
  const status = getStatus();
  const out = path.join(os.tmpdir(), `novelverse-piper-${Date.now()}.wav`);
  await new Promise((resolve, reject) => {
    const options = getNarrationOptions(req.options);
    const lengthScale = String(Math.min(2, Math.max(0.2, 1 / options.rate)));
    const sentenceSilence = String((options.sentencePause * options.pauseLength / 1000).toFixed(2));
    const args = ['--model', status.modelPath, '--output_file', out, '--length_scale', lengthScale, '--sentence_silence', sentenceSilence];
    const child = spawn(status.binPath, args);
    child.stdin.end(prepareText(req.text, options));
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`piper exited ${code}`)));
  });
  const audio = await readFile(out); await rm(out, { force: true });
  return { audio, metadata: { provider: 'piper', voice: process.env.PIPER_VOICE || 'uk_UA-lada-medium', options: getNarrationOptions(req.options), pitchNote: 'Piper does not expose native pitch shifting; pitch is applied by browser preview and persisted for compatible clients.' } };
}
