export const EMOTIONS = ["Neutral", "Happy", "Sad", "Angry", "Fear", "Whisper", "Shouting"];

export const VOICES = ["Aster", "Briar", "Cedar", "Dahlia", "Ember", "Flint", "Lumen", "Narrator"];

const DIRECTOR_VERSION = 1;
const LONG_SEGMENT_CHARS = 500;
const NAME = "[\\p{Lu}][\\p{L}'’-]*(?:\\s+[\\p{Lu}][\\p{L}'’-]*){0,2}";
const SPEECH_VERBS = "said|asked|replied|answered|whispered|shouted|cried|murmured|yelled|called|added|sighed";
const THOUGHT_VERBS = "thought|wondered|remembered|realized|imagined";

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
  if (/\b(whisper(?:ed|ing)?|murmur(?:ed|ing)?|softly|тихо|шеп)/iu.test(value)) return "Whisper";
  if (/\b(shout(?:ed|ing)?|yell(?:ed|ing)?|scream(?:ed|ing)?|крич)/iu.test(value) || /!{2,}/.test(text)) return "Shouting";
  if (/\b(angry|furious|rage|snarl(?:ed)?|гнів|зл[а-я]*|ярост)/iu.test(value)) return "Angry";
  if (/\b(afraid|fear|terrif(?:ied|ying)|trembl(?:e|ed|ing)|scared|страх|боя|жах)/iu.test(value)) return "Fear";
  if (/\b(sad|cried|crying|wept|sorrow|сум|плач)/iu.test(value)) return "Sad";
  if (/\b(happy|laugh(?:ed|ing)?|smil(?:e|ed|ing)|joy|glad|щаслив|усміх|рад)/iu.test(value)) return "Happy";
  return "Neutral";
}

function attributedName(text) {
  const verbs = `${SPEECH_VERBS}|${THOUGHT_VERBS}`;
  const afterVerb = new RegExp(`(?:${verbs})\\s+(${NAME})`, "iu").exec(text);
  const beforeVerb = new RegExp(`(${NAME})\\s+(?:${verbs})`, "iu").exec(text);
  return beforeVerb?.[1] || afterVerb?.[1] || "";
}

function sentences(text) {
  return (text.match(/[^.!?…]+(?:[.!?…]+|$)/gu) || [text]).map((part) => part.trim()).filter(Boolean);
}

function parseLine(line) {
  const thought = /^\[\[thought\]\]([\s\S]*)\[\[\/thought\]\]$/.exec(line);
  if (thought) return sentences(plainText(thought[1])).map((text) => ({ type: "Thought", speaker: attributedName(line), text }));
  const labelled = new RegExp(`^(${NAME})\\s*:\\s+`, "u").exec(line);
  if (labelled) return sentences(line.slice(labelled[0].length)).map((text) => ({ type: "Dialogue", speaker: labelled[1], text }));

  const quotePattern = /[“"]([^”"]+)[”"]/gu;
  const quotes = [...line.matchAll(quotePattern)];
  if (!quotes.length) return sentences(line).map((text) => ({ type: "Narration", speaker: "Narrator", text }));

  const speaker = attributedName(line);
  const parts = [];
  let cursor = 0;
  for (const quote of quotes) {
    const before = line.slice(cursor, quote.index).trim().replace(/^[,;—–-]+|[,;—–-]+$/g, "").trim();
    if (before) parts.push(...sentences(before).map((text) => ({ type: "Narration", speaker: "Narrator", text })));
    parts.push(...sentences(quote[1]).map((text) => ({ type: "Dialogue", speaker, text })));
    cursor = quote.index + quote[0].length;
  }
  const after = line.slice(cursor).trim().replace(/^[,;—–-]+/, "").trim();
  if (after) parts.push(...sentences(after).map((text) => ({ type: "Narration", speaker: "Narrator", text })));
  return parts;
}

export function detectSegments(text) {
  return plainText(thoughtText(text)).split(/\n+/).map((line) => line.trim()).filter(Boolean).flatMap(parseLine);
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
  const raw = chapters.flatMap((chapter) => detectSegments(chapter.content).map((segment) => ({ ...segment, chapterId: chapter.id, chapterTitle: chapter.title })));
  const detected = raw.map((item) => item.speaker).filter(Boolean);
  const names = [...new Set(["Narrator", ...detected])];
  const characters = names.map(createCharacter);
  const byName = Object.fromEntries(characters.map((character) => [character.name, character]));
  const segments = raw.map((item, index) => ({
    id: globalThis.crypto?.randomUUID?.() || `segment-${Date.now()}-${index}`,
    ...item,
    emotion: classifyEmotion(item.text),
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
