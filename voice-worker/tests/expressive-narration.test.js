import test from 'node:test';
import assert from 'node:assert/strict';
import { detectNarrationEmotion, NARRATION_EMOTIONS, prepareExpressiveRequest } from '../processors/expressive-narration.js';
import { localEndpoint } from '../providers/local-http.js';
import { getProviders } from '../providers/index.js';

test('detects the six narration emotions locally without tags', () => {
  assert.deepEqual(NARRATION_EMOTIONS, ['neutral', 'happy', 'sad', 'angry', 'fear', 'surprise']);
  assert.equal(detectNarrationEmotion('An ordinary road crossed the field.').emotion, 'neutral');
  assert.equal(detectNarrationEmotion('She smiled, delighted and happy.').emotion, 'happy');
  assert.equal(detectNarrationEmotion('He cried lonely tears in grief.').emotion, 'sad');
  assert.equal(detectNarrationEmotion('Furious, she shouted: ATTACK!').emotion, 'angry');
  assert.equal(detectNarrationEmotion('Terrified, he trembled in fear.').emotion, 'fear');
  assert.equal(detectNarrationEmotion('Suddenly, she gasped in surprise!').emotion, 'surprise');
});

test('ignores manual emotion input and produces automatic delivery controls', () => {
  const request = prepareExpressiveRequest({ text: 'He cried tears of grief.', options: { emotion: 'happy' } });
  assert.equal(request.options.emotion, 'sad');
  assert.equal(request.expression.emotion, 'sad');
  assert.ok(request.options.delivery.rate < 1);
});

test('keeps network adapters local and orders the fallback engines', () => {
  assert.equal(localEndpoint('https://example.com/tts', ''), '');
  assert.equal(localEndpoint('http://127.0.0.1:8080/v1/tts', ''), 'http://127.0.0.1:8080/v1/tts');
  assert.deepEqual(getProviders({}).slice(0, 3).map(({ id }) => id), ['fish-speech', 'kokoro', 'piper']);
});
