import test from "node:test";
import assert from "node:assert/strict";
import { analyzeChapters, estimateDuration, parseDirectorJson, plainText, validateSegments } from "../src/lib/voiceDirectorLocal.js";

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
