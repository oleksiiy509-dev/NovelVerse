import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNarratedChapterSegments } from '../lib/narrationRendering.js';

test('voice worker bundles narration rendering without repository source files', () => {
  const segments = prepareNarratedChapterSegments([{ text: 'The darkness hid the key. Attack now!' }], { voice: 'narrator' });

  assert.equal(segments.length, 2);
  assert.equal(segments.every((segment) => segment.voice === 'narrator'), true);
  assert.equal(segments.every((segment) => segment.narrationEngine.version === 3), true);
  assert.notEqual(segments[0].energy, segments[1].energy);
});
