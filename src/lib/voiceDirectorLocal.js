export const EMOTIONS = ["Neutral", "Happy", "Sad", "Angry", "Fear", "Whisper", "Shouting"];

export const VOICES = ["Aster", "Briar", "Cedar", "Dahlia", "Ember", "Flint", "Lumen", "Narrator"];

const DIRECTOR_VERSION = 1;
const LONG_SEGMENT_CHARS = 500;

export function plainText(html = "") {
  return String(html)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function emotionFor(text) {
  const value = text.toLowerCase();
  if (/\b(whisper(?:ed|ing)?|murmur(?:ed|ing)?|тихо|шеп)/i.test(value)) return "Whisper";
  if (/\b(shout(?:ed|ing)?|yell(?:ed|ing)?|scream(?:ed|ing)?|крич)/i.test(value) || /!{2,}/.test(text)) return "Shouting";
  if (/\b(angry|furious|rage|snarl(?:ed)?|гнів|зл[а-я]*|ярост)/i.test(value)) return "Angry";
  if (/\b(afraid|fear|terrified|trembl(?:e|ed|ing)|scared|страх|боя|жах)/i.test(value)) return "Fear";
  if (/\b(sad|cried|crying|wept|sorrow|сум|плач)/i.test(value)) return "Sad";
  if (/\b(happy|laughed|smiled|joy|glad|щаслив|усміх|рад)/i.test(value)) return "Happy";
  return "Neutral";
}

function nameFromLine(line) {
  const colon = line.match(/^([\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,2})\s*:\s+/u);
  if (colon) return colon[1];
  const attribution = line.match(/(?:said|asked|replied|whispered|shouted|cried|murmured)\s+([\p{Lu}][\p{L}'’-]*)|([\p{Lu}][\p{L}'’-]*)\s+(?:said|asked|replied|whispered|shouted|cried|murmured)/iu);
  return attribution?.[1] || attribution?.[2] || "Narrator";
}

function segmentText(text) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.flatMap((line) => {
    const speaker = nameFromLine(line);
    const withoutLabel = line.replace(/^([\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,2})\s*:\s+/u, "");
    const parts = withoutLabel.match(/[^.!?…]+(?:[.!?…]+|$)/gu) || [withoutLabel];
    return parts.map((part) => ({ speaker, text: part.trim() })).filter((item) => item.text);
  });
}

export function createCharacter(name, index = 0) {
  return {
    id: `character-${name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-") || index}`,
    name,
    voice: name === "Narrator" ? "Narrator" : VOICES[index % (VOICES.length - 1)],
    gender: "Unspecified",
    age: "Adult",
    narrationStyle: name === "Narrator" ? "Storytelling" : "Natural",
    speed: 1,
    pitch: 0,
    volume: 1,
  };
}

export function estimateDuration(text, speed = 1) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / (150 * Math.max(0.5, Number(speed) || 1))) * 60));
}

export function analyzeChapters(chapters = []) {
  const raw = chapters.flatMap((chapter) => segmentText(plainText(chapter.content)).map((segment) => ({ ...segment, chapterId: chapter.id, chapterTitle: chapter.title })));
  const names = [...new Set(["Narrator", ...raw.map((item) => item.speaker)])];
  const characters = names.map(createCharacter);
  const byName = Object.fromEntries(characters.map((character) => [character.name, character]));
  const segments = raw.map((item) => ({
    id: crypto.randomUUID(),
    ...item,
    emotion: emotionFor(item.text),
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

export function directorStorageKey(bookId) {
  return `novelverse.voice-director.v1.${bookId}`;
}
