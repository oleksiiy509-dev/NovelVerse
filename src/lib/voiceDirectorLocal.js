export const EMOTIONS = ["Neutral", "Happy", "Sad", "Angry", "Fear", "Whisper", "Shouting"];

export const VOICES = ["Aster", "Briar", "Cedar", "Dahlia", "Ember", "Flint", "Lumen", "Narrator"];

const DIRECTOR_VERSION = 1;
const LONG_SEGMENT_CHARS = 500;
const NAME = "[\\p{Lu}][\\p{L}'’-]*(?:\\s+[\\p{Lu}][\\p{L}'’-]*){0,2}";
const SPEECH_VERBS = "said|asked|replied|answered|whispered|shouted|cried|murmured|muttered|yelled|called|added|sighed|snapped|exclaimed|begged|pleaded|demanded|warned|insisted|laughed|sobbed|growled|hissed";
const THOUGHT_VERBS = "thought|wondered|remembered|realized|imagined";
const FALSE_NAMES = new Set(["a", "an", "the", "he", "she", "they", "we", "i", "you", "it", "his", "her", "their", "someone", "anyone", "everyone", "nobody", "chapter", "part", "meanwhile", "later", "then", "finally", "suddenly", "narrator"]);

const thoughtText = (html) => String(html).replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, "\n[[thought]]$1[[/thought]]\n");

export function plainText(html = "") {
  return String(html)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, (entity) => entity.toLowerCase() === "&ldquo;" ? "“" : "”")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function classifyEmotion(text) {
  const value = String(text).toLowerCase();
  const signals = [
    ["Whisper", /\b(whisper(?:ed|ing)?|murmur(?:ed|ing)?|mutter(?:ed|ing)?|hushed|under (?:his|her|their) breath|softly|тихо|шеп)/iu],
    ["Shouting", /\b(shout(?:ed|ing)?|yell(?:ed|ing)?|scream(?:ed|ing)?|roared|bellowed|exclaimed|крич)/iu],
    ["Angry", /\b(angry|furious|rage|enraged|snarl(?:ed)?|snapped|growled|hissed|hate|damn|гнів|зл[а-я]*|ярост)/iu],
    ["Fear", /\b(afraid|fear|panic(?:ked)?|terrif(?:ied|ying)|trembl(?:e|ed|ing)|shuddered|scared|horrified|страх|боя|жах)/iu],
    ["Sad", /\b(sad|cried|crying|wept|sobbed|sorrow|grief|heartbroken|tears?|сум|плач)/iu],
    ["Happy", /\b(happy|laugh(?:ed|ing)?|grinned|smil(?:e|ed|ing)|joy|delighted|glad|cheered|щаслив|усміх|рад)/iu],
  ];
  if (/!{2,}/.test(value) || (/!/.test(value) && /\b(now|stop|run|no|help|listen)\b/iu.test(value))) return "Shouting";
  for (const [emotion, pattern] of signals) if (pattern.test(value)) return emotion;
  return "Neutral";
}

function cleanName(name) {
  return String(name || "").replace(/[’']s$/iu, "").replace(/\s+/g, " ").trim();
}

function validName(name) {
  const words = cleanName(name).toLocaleLowerCase().split(/\s+/u);
  return Boolean(words[0]) && !words.some((word) => FALSE_NAMES.has(word)) && !/^(?:mr|mrs|ms|dr|sir|lady)$/iu.test(cleanName(name));
}

function attributedName(text) {
  const verbs = `${SPEECH_VERBS}|${THOUGHT_VERBS}`;
  const afterVerb = new RegExp(`(?:${verbs})\\s+(${NAME})`, "iu").exec(text);
  const beforeVerb = new RegExp(`(${NAME})\\s+(?:${verbs})`, "iu").exec(text);
  const name = cleanName(beforeVerb?.[1] || afterVerb?.[1]);
  return validName(name) ? name : "";
}

function sentences(text) {
  return (text.match(/[^.!?…]+(?:[.!?…]+|$)/gu) || [text]).map((part) => part.trim()).filter(Boolean);
}

function withContext(segment, context) {
  Object.defineProperty(segment, "analysisContext", { value: context, enumerable: false });
  return segment;
}

function parseLine(line, fallbackSpeaker = "") {
  const thought = /^\[\[thought\]\]([\s\S]*)\[\[\/thought\]\]$/.exec(line);
  if (thought) return sentences(plainText(thought[1])).map((text) => ({ type: "Thought", speaker: attributedName(line), text }));
  const labelled = new RegExp(`^(${NAME})\\s*:\\s+`, "u").exec(line);
  if (labelled) return sentences(line.slice(labelled[0].length)).map((text) => ({ type: "Dialogue", speaker: labelled[1], text }));

  const quotePattern = /[“"]([^”"]+)[”"]/gu;
  const quotes = [...line.matchAll(quotePattern)];
  if (!quotes.length) return sentences(line).map((text) => ({ type: "Narration", speaker: "Narrator", text }));

  const speaker = attributedName(line) || fallbackSpeaker;
  const parts = [];
  let cursor = 0;
  for (const quote of quotes) {
    const before = line.slice(cursor, quote.index).trim().replace(/^[,;—–-]+|[,;—–-]+$/g, "").trim();
    if (before) parts.push(...sentences(before).map((text) => ({ type: "Narration", speaker: "Narrator", text })));
    parts.push(...sentences(quote[1]).map((text) => withContext({ type: "Dialogue", speaker, text }, line)));
    cursor = quote.index + quote[0].length;
  }
  const after = line.slice(cursor).trim().replace(/^[,;—–-]+/, "").trim();
  if (after) parts.push(...sentences(after).map((text) => ({ type: "Narration", speaker: "Narrator", text })));
  return parts;
}

export function detectSegments(text) {
  const lines = plainText(thoughtText(text)).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const explicitNames = lines.map((line) => {
    const labelled = new RegExp(`^(${NAME})\\s*:\\s+`, "u").exec(line)?.[1];
    return cleanName(attributedName(line) || labelled);
  }).filter(validName);
  const canonical = new Map();
  for (const name of explicitNames) if (!canonical.has(name.toLocaleLowerCase())) canonical.set(name.toLocaleLowerCase(), name);
  const participants = [];
  let lastSpeaker = "";
  return lines.flatMap((line) => {
    const labelled = new RegExp(`^(${NAME})\\s*:\\s+`, "u").exec(line)?.[1] || "";
    let speaker = attributedName(line) || (validName(labelled) ? labelled : "");
    if (!speaker && /[“"]/u.test(line)) {
      const nearby = [...canonical.values()].find((name) => new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu").test(line));
      speaker = nearby || (participants.length === 2 ? participants.find((name) => name !== lastSpeaker) : participants[0]) || "";
    }
    if (speaker) {
      speaker = canonical.get(cleanName(speaker).toLocaleLowerCase()) || cleanName(speaker);
      const old = participants.indexOf(speaker);
      if (old >= 0) participants.splice(old, 1);
      participants.push(speaker);
      if (participants.length > 2) participants.shift();
      lastSpeaker = speaker;
    }
    return parseLine(line, speaker);
  });
}

export function createCharacter(name, index = 0) {
  return {
    id: `character-${name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-") || index}`,
    name,
    voice: name === "Narrator" ? "Narrator" : VOICES[index % (VOICES.length - 1)],
    gender: "Unspecified", age: "Adult",
    narrationStyle: name === "Narrator" ? "Storytelling" : "Natural",
    speed: 1, pitch: 0, volume: 1,
  };
}

export function estimateDuration(text, speed = 1) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / (150 * Math.max(0.5, Number(speed) || 1))) * 60));
}

export function analyzeChapters(chapters = []) {
  const raw = chapters.flatMap((chapter) => detectSegments(chapter.content).map((segment) => ({ ...segment, analysisContext: segment.analysisContext || "", chapterId: chapter.id, chapterTitle: chapter.title })));
  const canonicalNames = new Map([["narrator", "Narrator"]]);
  for (const item of raw) {
    const name = cleanName(item.speaker);
    if (validName(name) && !canonicalNames.has(name.toLocaleLowerCase())) canonicalNames.set(name.toLocaleLowerCase(), name);
    item.speaker = name ? canonicalNames.get(name.toLocaleLowerCase()) || "" : "";
  }
  const names = [...canonicalNames.values()];
  const characters = names.map(createCharacter);
  const byName = Object.fromEntries(characters.map((character) => [character.name, character]));
  const segments = raw.map(({ analysisContext, ...item }, index) => ({
    id: globalThis.crypto?.randomUUID?.() || `segment-${Date.now()}-${index}`,
    ...item,
    emotion: classifyEmotion(`${item.text} ${analysisContext}`),
    voice: byName[item.speaker]?.voice || "",
    estimatedDuration: estimateDuration(item.text, byName[item.speaker]?.speed),
  }));
  for (const character of characters) {
    const appearances = segments.map((segment, index) => ({ segment, index })).filter(({ segment }) => segment.speaker === character.name);
    character.lineCount = appearances.length;
    character.firstAppearance = appearances.length ? appearances[0].index + 1 : null;
    character.lastAppearance = appearances.length ? appearances.at(-1).index + 1 : null;
  }
  return { version: DIRECTOR_VERSION, updatedAt: new Date().toISOString(), characters, segments };
}

export function validateSegments(segments = [], characters = []) {
  const known = new Set(characters.map((character) => character.name));
  return segments.flatMap((segment, index) => {
    const warnings = [];
    if (!segment.speaker?.trim()) warnings.push("Speaker missing");
    else if (known.size && !known.has(segment.speaker)) warnings.push("Unknown speaker");
    if (!segment.voice?.trim()) warnings.push("Voice missing");
    if (!segment.text?.trim()) warnings.push("Empty segment");
    if (segment.text?.length > LONG_SEGMENT_CHARS) warnings.push("Segment too long");
    return warnings.map((message) => ({ segmentId: segment.id, index, message }));
  });
}

export function parseDirectorJson(raw) {
  const value = JSON.parse(raw);
  if (!value || !Array.isArray(value.characters) || !Array.isArray(value.segments)) throw new Error("Invalid Voice Director JSON");
  const characters = value.characters.map((character, index) => ({ ...createCharacter(character.name || `Character ${index + 1}`, index), ...character }));
  const segments = value.segments.map((segment, index) => ({
    id: segment.id || `segment-imported-${index}`,
    type: segment.type || segment.segment_type || "Narration",
    speaker: segment.speaker ?? segment.speakerName ?? segment.speaker_name ?? "",
    emotion: EMOTIONS.includes(segment.emotion) ? segment.emotion : "Neutral",
    voice: segment.voice ?? segment.voiceProfile ?? segment.voice_profile ?? "",
    text: String(segment.text ?? ""),
    estimatedDuration: segment.estimatedDuration ?? estimateDuration(segment.text),
    ...segment,
  }));
  return { ...value, version: value.version ?? DIRECTOR_VERSION, updatedAt: new Date().toISOString(), characters, segments };
}

export function directorStorageKey(bookId) { return `novelverse.voice-director.v1.${bookId}`; }
