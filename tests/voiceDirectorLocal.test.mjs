import test from "node:test";
import assert from "node:assert/strict";
import { analyzeChapters, detectSegments, estimateDuration, parseDirectorJson, plainText, validateSegments } from "../src/lib/voiceDirectorLocal.js";
import { hydrateManagedChapters } from "../src/lib/bookManagement.js";
import { prepareNarratedChapterSegments } from "../src/lib/narrationRendering.js";

test("hydrates chapter metadata before analysis and preserves its real text", async () => {
  const original = "The signal arrived — before dawn!";
  const chapters = await hydrateManagedChapters(
    [{ id: "chapter-1", title: "Signal" }],
    async (id) => ({ id, content: original }),
  );
  const result = analyzeChapters(chapters);
  assert.equal(result.segments[0].text, original);
  assert.notEqual(result.segments[0].text, undefined);
});

test("chapter generation derives renderer input from segment.text", () => {
  const text = "The actual narration text.";
  const rendered = prepareNarratedChapterSegments([{ type: "Narration", text }]);
  assert.equal(rendered.map((segment) => segment.text).join(" "), text);
});

test("analyzes imported chapter HTML into speakers and emotional segments", () => {
  const result = analyzeChapters([{ id: "one", title: "Arrival", content: "<p>Mara: I am so happy!</p><p>The door opened.</p>" }]);
  assert.deepEqual(result.characters.map(({ name }) => name), ["Narrator", "Mara"]);
  assert.equal(result.segments[0].speaker, "Mara");
  assert.equal(result.segments[0].emotion, "Happy");
  assert.equal(result.segments[1].speaker, "Narrator");
});

test("validates incomplete and oversized segments", () => {
  const warnings = validateSegments([{ id: "x", speaker: "", voice: "", text: "x".repeat(501) }, { id: "y", speaker: "Narrator", voice: "Narrator", text: "" }]);
  assert.deepEqual(warnings.map(({ message }) => message), ["Speaker missing", "Voice missing", "Segment too long", "Empty segment"]);
});

test("normalizes source text, estimates duration and validates imported JSON", () => {
  assert.equal(plainText("<p>A &amp; B</p><p>C</p>"), "A & B\nC");
  assert.equal(estimateDuration("one two three four five", 1), 2);
  assert.throws(() => parseDirectorJson('{"segments":[]}'), /Invalid Voice Director JSON/);
});

test("separates quoted dialogue from narration and assigns an attributed speaker", () => {
  const segments = detectSegments('The room fell quiet. “We should leave now!” Mara whispered.');
  assert.deepEqual(segments, [
    { type: "Narration", speaker: "Narrator", text: "The room fell quiet." },
    { type: "Dialogue", speaker: "Mara", text: "We should leave now!" },
    { type: "Narration", speaker: "Narrator", text: "Mara whispered." },
  ]);
});

test("detects marked thoughts and reports character appearance statistics", () => {
  const result = analyzeChapters([{ id: "c1", title: "A thought", content: "<p>Mara: Hello.</p><p><em>Mara thought this was terrifying.</em></p><p>Mara: Run!!</p>" }]);
  const mara = result.characters.find(({ name }) => name === "Mara");
  assert.deepEqual({ lines: mara.lineCount, first: mara.firstAppearance, last: mara.lastAppearance }, { lines: 3, first: 1, last: 3 });
  assert.equal(result.segments[1].type, "Thought");
  assert.equal(result.segments[1].speaker, "Mara");
  assert.equal(result.segments[1].emotion, "Fear");
  assert.equal(typeof result.segments[1].estimatedDuration, "number");
});

test("warns when a named speaker is not in the character list", () => {
  assert.equal(validateSegments([{ id: "s", speaker: "Ghost", voice: "Aster", text: "Boo" }], [{ name: "Narrator" }])[0].message, "Unknown speaker");
});

test("imports legacy Director aliases without losing additional data", () => {
  const result = parseDirectorJson(JSON.stringify({ version: "legacy", characters: [{ name: "Mara" }], segments: [{ id: "s", segment_type: "dialogue", speaker_name: "Mara", voice_profile: "Aster", text: "Hi" }], scenes: [{ id: 1 }] }));
  assert.equal(result.segments[0].type, "dialogue");
  assert.equal(result.segments[0].speaker, "Mara");
  assert.equal(result.segments[0].voice, "Aster");
  assert.deepEqual(result.scenes, [{ id: 1 }]);
});

test("uses nearby known names and alternating conversation context for unattributed quotes", () => {
  const content = [
    "Mara: We need to talk.",
    "Elias: I am listening.",
    "Mara looked toward the door. “We cannot stay.”",
    "“Where will we go?”",
  ].join("\n");
  const dialogue = detectSegments(content).filter(({ type }) => type === "Dialogue");
  assert.deepEqual(dialogue.map(({ speaker }) => speaker), ["Mara", "Elias", "Mara", "Elias"]);
});

test("merges case-only duplicate character names and ignores pronoun attributions", () => {
  const result = analyzeChapters([{ id: "c", title: "Talk", content: 'Mara: Hello.\nMARA: Again.\n“Wait,” he said.' }]);
  assert.deepEqual(result.characters.map(({ name }) => name), ["Narrator", "Mara"]);
  assert.equal(result.characters.find(({ name }) => name === "Mara").lineCount, 3);
  assert.equal(result.segments.filter(({ type }) => type === "Dialogue").at(-1).speaker, "Mara");
});

test("predicts emotion from dialogue delivery and stronger punctuation cues", () => {
  const result = analyzeChapters([{ id: "c", title: "Danger", content: '“Do not move,” Mara whispered.\n“RUN!” Elias shouted.' }]);
  assert.deepEqual(result.segments.filter(({ type }) => type === "Dialogue").map(({ emotion }) => emotion), ["Whisper", "Shouting"]);
});

test("attributes English action tags and Russian and Ukrainian speech verbs", () => {
  const dialogue = detectSegments([
    '“I know,” Mara looked at Elias and said.',
    '«Нет», — ответил Илья.',
    '«Ходімо», — прошепотіла Олена.',
  ].join("\n")).filter(({ type }) => type === "Dialogue");
  assert.deepEqual(dialogue.map(({ speaker }) => speaker), ["Mara", "Илья", "Олена"]);
});

test("recognizes em-dash dialogue and keeps its explicitly established speaker", () => {
  const dialogue = detectSegments('Мара: Привіт.\n— Я хотіла ще додати.').filter(({ type }) => type === "Dialogue");
  assert.equal(dialogue.at(-1).type, "Dialogue");
  assert.equal(dialogue.at(-1).speaker, "Мара");
});

test("merges unique full-name, first-name, surname, and honorific aliases", () => {
  const result = analyzeChapters([{ id: "c", title: "Aliases", content: [
    "Mara Voss: First.",
    "Mara: Second.",
    "Ms. Voss: Third.",
  ].join("\n") }]);
  assert.deepEqual(result.characters.map(({ name }) => name), ["Narrator", "Mara Voss"]);
  assert.deepEqual(result.segments.map(({ speaker }) => speaker), ["Mara Voss", "Mara Voss", "Mara Voss"]);
});
