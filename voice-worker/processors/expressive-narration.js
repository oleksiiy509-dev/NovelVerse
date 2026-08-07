export const NARRATION_EMOTIONS = Object.freeze(['neutral', 'happy', 'sad', 'angry', 'fear', 'surprise']);

const cues = {
  angry: /\b(angry|furious|rage|raged|hate|shout(?:ed|ing)?|yell(?:ed|ing)?|damn|attack)\b/i,
  fear: /\b(afraid|fear|feared|terrified|terror|panic(?:ked)?|danger|trembl\w*|scream(?:ed|ing)?)\b/i,
  sad: /\b(sad|sorrow|grief|grieve|cried|crying|tears?|lonely|heartbroken|goodbye|lost)\b/i,
  happy: /\b(happy|happily|joy|joyful|smil\w*|laugh\w*|delight\w*|wonderful|glad|love)\b/i,
  surprise: /\b(suddenly|unexpected(?:ly)?|astonish\w*|surpris\w*|gasp(?:ed|ing)?|unbelievable)\b/i,
};

const delivery = {
  neutral: { rate: 1, pitch: 1, energy: 0.5 },
  happy: { rate: 1.07, pitch: 1.05, energy: 0.72 },
  sad: { rate: 0.86, pitch: 0.94, energy: 0.32 },
  angry: { rate: 1.08, pitch: 0.98, energy: 0.92 },
  fear: { rate: 1.04, pitch: 1.08, energy: 0.68 },
  surprise: { rate: 1.12, pitch: 1.1, energy: 0.82 },
};

export function detectNarrationEmotion(text = '') {
  const source = String(text);
  const scores = Object.fromEntries(NARRATION_EMOTIONS.map((emotion) => [emotion, 0]));
  for (const [emotion, pattern] of Object.entries(cues)) {
    const matches = source.match(new RegExp(pattern.source, `${pattern.flags}g`));
    scores[emotion] += (matches?.length || 0) * 2;
  }
  const punctuation = (source.match(/!/g) || []).length;
  if (punctuation) scores.surprise += Math.min(2, punctuation);
  if (/\?!(?:\s|$)|!\?(?:\s|$)/.test(source)) scores.surprise += 3;
  if (/\b[A-Z]{3,}\b/.test(source)) scores.angry += 2;
  const [emotion, score] = Object.entries(scores).filter(([name]) => name !== 'neutral').sort((a, b) => b[1] - a[1])[0] || ['neutral', 0];
  const selected = score > 0 ? emotion : 'neutral';
  return { emotion: selected, intensity: Math.min(1, Number((selected === 'neutral' ? 0.2 : 0.42 + score * 0.09).toFixed(2))), delivery: delivery[selected] };
}

export function prepareExpressiveRequest(request = {}) {
  const expression = detectNarrationEmotion(request.text);
  return {
    ...request,
    // Emotion is deliberately derived from prose. Incoming tags cannot override it.
    options: { ...request.options, emotion: expression.emotion, intensity: expression.intensity, delivery: expression.delivery },
    expression,
  };
}
