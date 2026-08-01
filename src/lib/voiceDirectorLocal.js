export const EMOTIONS = ["Neutral", "Happy", "Sad", "Angry", "Fear", "Whisper", "Shouting"];

export const VOICES = ["Aster", "Briar", "Cedar", "Dahlia", "Ember", "Flint", "Lumen", "Narrator"];

const DIRECTOR_VERSION = 1;
const LONG_SEGMENT_CHARS = 500;
const NAME = "[\\p{Lu}][\\p{L}'’-]*(?:\\s+[\\p{Lu}][\\p{L}'’-]*){0,2}";
const SPEECH_VERBS = "said|asked|replied|answered|whispered|shouted|cried|murmured|yelled|called|added|sighed";

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
  if (/\b(afraid|fear|terrified|trembl(?:e|ed|ing)|scared|страх|боя|жах)/iu.test(value)) return "Fear";
  if (/\b(sad|cried|crying|wept|sorrow|сум|плач)/iu.test(value)) return "Sad";
  if (/\b(happy|laugh(?:ed|ing)?|smil(?:e|ed|ing)|joy|glad|щаслив|усміх|рад)/iu.test(value)) return "Happy";
  return "Neutral";
}

function attributedName(text) {
  const afterVerb = new RegExp(`(?:${SPEECH_VERBS})\\s+(${NAME})`, "iu").exec(text);
  const beforeVerb = new RegExp(`(${NAME})\\s+(?:${SPEECH_VERBS})`, "iu").exec(text);
  return afterVerb?.[1] || beforeVerb?.[1] || "";
}

function sentences(text) {
  return (text.match(/[^.!?…]+(?:[.!?…]+|$)/gu) || [text]).map((part) => part.trim()).filter(Boolean);
}

function parseLine(line) {
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
  return plainText(text).split(/\n+/).map((line) => line.trim()).filter(Boolean).flatMap(parseLine);
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
  }));
  return { version: DIRECTOR_VERSION, updatedAt: new Date().toISOString(), characters, segments };
}

export function validateSegments(segments = []) {
  return segments.flatMap((segment, index) => {
    const warnings = [];
    if (!segment.speaker?.trim()) warnings.push("Speaker missing");
    if (!segment.voice?.trim()) warnings.push("Voice missing");
    if (!segment.text?.trim()) warnings.push("Empty segment");
    if (segment.text?.length > LONG_SEGMENT_CHARS) warnings.push("Segment too long");
    return warnings.map((message) => ({ segmentId: segment.id, index, message }));
  });
}

export function parseDirectorJson(raw) {
  const value = JSON.parse(raw);
  if (!value || !Array.isArray(value.characters) || !Array.isArray(value.segments)) throw new Error("Invalid Voice Director JSON");
  return { version: DIRECTOR_VERSION, updatedAt: new Date().toISOString(), characters: value.characters, segments: value.segments };
}

export function directorStorageKey(bookId) { return `novelverse.voice-director.v1.${bookId}`; }
