import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const load = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('production compose wires three isolated, monitored services', async () => {
  const compose = await load('docker-compose.production.yml');
  for (const service of ['api:', 'voice-worker:', 'fish-speech:']) assert.match(compose, new RegExp(`^  ${service}`, 'm'));
  assert.match(compose, /capabilities: \[gpu\]/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /max-size: "10m"/);
});

test('production images run unprivileged health-checked services', async () => {
  const [api, worker, fish] = await Promise.all([load('Dockerfile.api'), load('voice-worker/Dockerfile'), load('voice-worker/Dockerfile.fish-speech')]);
  assert.match(api, /USER novelverse/);
  assert.match(worker, /USER novelverse/);
  for (const image of [api, worker, fish]) assert.match(image, /HEALTHCHECK/);
});

test('environment validator accepts complete secrets and rejects placeholders', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novelverse-deploy-'));
  const file = join(directory, '.env.production');
  const valid = [
    'VITE_SUPABASE_URL=https://project-ref.supabase.co', 'VITE_SUPABASE_ANON_KEY=anon',
    'SUPABASE_URL=https://project-ref.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY=secret',
    'VOICE_WORKER_TOKEN=abcdefghijklmnopqrstuvwxyz123456', 'R2_ENDPOINT=https://account.r2.cloudflarestorage.com',
    'R2_BUCKET=audio', 'R2_ACCESS_KEY_ID=key', 'R2_SECRET_ACCESS_KEY=secret',
  ].join('\n');
  await writeFile(file, valid);
  assert.equal(spawnSync(process.execPath, ['scripts/validate-production-env.mjs', file]).status, 0);
  await writeFile(file, valid.replace('audio', 'change-me'));
  assert.equal(spawnSync(process.execPath, ['scripts/validate-production-env.mjs', file]).status, 1);
  await rm(directory, { recursive: true });
});

test('production environment documents Supabase and R2 boundaries', async () => {
  const environment = await load('.env.production.example');
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'FISH_SPEECH_URL']) assert.match(environment, new RegExp(`^${key}=`, 'm'));
  assert.doesNotMatch(environment, /VITE_SUPABASE_SERVICE_ROLE_KEY/);
});
