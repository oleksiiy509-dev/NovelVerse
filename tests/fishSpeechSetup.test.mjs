import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const setupPath = new URL('../voice-worker/setup-fish-speech.ps1', import.meta.url);
const startPath = new URL('../voice-worker/start-fish-speech.ps1', import.meta.url);

test('Fish Speech setup installs and verifies one matching CUDA PyTorch family', async () => {
  const setup = await readFile(setupPath, 'utf8');

  assert.match(setup, /\[string\]\$TorchVersion = '2\.4\.1'/);
  assert.match(setup, /\[string\]\$TorchvisionVersion = '0\.19\.1'/);
  assert.match(setup, /\$CudaWheelTag = 'cu121'/);
  assert.match(setup, /download\.pytorch\.org\/whl\/\$CudaWheelTag/);
  assert.match(setup, /"torch==\$TorchVersion", "torchvision==\$TorchvisionVersion", "torchaudio==\$TorchVersion"/);
  assert.match(setup, /import torch, torchaudio/);
  assert.match(setup, /torch\.cuda\.is_available\(\)/);
});

test('Fish Speech commands do not resync over the verified CUDA wheels', async () => {
  const [setup, start] = await Promise.all([
    readFile(setupPath, 'utf8'),
    readFile(startPath, 'utf8'),
  ]);

  assert.match(setup, /'run', '--no-sync', 'hf'/);
  assert.match(start, /'run', '--no-sync', 'python'/);
});
