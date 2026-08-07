const DASHES = /[\u2012\u2013\u2014\u2015]/g;
const SMART_QUOTES = /[\u201c\u201d\u00ab\u00bb]/g;

export const narratorVoice = () => process.env.NARRATOR_VOICE || process.env.FISH_SPEECH_VOICE || process.env.KOKORO_VOICE || process.env.PIPER_VOICE || 'novelverse-narrator';

export function normalizeNarrationText(value = '') {
  return String(value).normalize('NFC').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\.\.\.+/g, '…').replace(DASHES, '—').replace(/[ \t]+([,.;:!?])/g, '$1').replace(/([,.;:!?])(?![\s\n"'\u2019\u201d\u00bb)\]])/g, '$1 ').replace(/[ \t]{2,}/g, ' ').replace(/ *\n */g, '\n').trim();
}

function classify(text) {
  const trimmed = text.trim();
  const dialogue = /^(?:["\u201c\u00ab]|—\s*)/.test(trimmed) || SMART_QUOTES.test(trimmed);
  const exclamation = /!+["\u201d\u00bb]?$/u.test(trimmed);
  const question = /\?+["\u201d\u00bb]?$/u.test(trimmed);
  return { dialogue, emphasis: exclamation ? 'strong' : question ? 'question' : /(?:^|\s)\p{Lu}{3,}(?:\s|$)/u.test(trimmed) ? 'strong' : 'natural' };
}

export function planNarration(text, { chapterTitle = '', sentencePause = 280, paragraphPause = 850 } = {}) {
  const blocks = normalizeNarrationText(text).split(/\n{2,}/).filter(Boolean);
  const units = [];
  if (chapterTitle) units.push({ type: 'chapter-title', text: normalizeNarrationText(chapterTitle), pauseBeforeMs: 0, pauseAfterMs: 1250, emphasis: 'title', dialogue: false });
  blocks.forEach((block, paragraphIndex) => {
    const sentences = block.match(/[^.!?…]+(?:[.!?…]+["'\u2019\u201d\u00bb)]*)?|.+$/gu) || [block];
    const clean = sentences.map((item) => item.trim()).filter(Boolean);
    clean.forEach((sentence, index) => {
      const traits = classify(sentence);
      const terminal = /[,;:]$/u.test(sentence) ? Math.round(sentencePause * .65) : sentencePause;
      units.push({ type: traits.dialogue ? 'dialogue' : 'narration', text: sentence, pauseBeforeMs: index === 0 && paragraphIndex > 0 ? 180 : 0, pauseAfterMs: index === clean.length - 1 ? paragraphPause : terminal, ...traits });
    });
  });
  return units;
}

export function prepareNarrationRequest(request = {}) {
  const options = request.options || {};
  const plan = planNarration(request.text, options);
  return { ...request, voice: narratorVoice(), text: plan.map(({ text }) => text).join(' '), options: { ...options, narrationPlan: plan, consistentVoice: true } };
}
