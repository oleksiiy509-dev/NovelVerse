import test from "node:test";
import assert from "node:assert/strict";
import { analyzeChapterVoice, stripChapterHtml } from "../src/lib/voiceEngine/analyzer.js";
function a(content, knownCharacters = []) { return analyzeChapterVoice({ chapterId: 1, novelId: 1, content, knownCharacters }); }
function texts(r) { return r.segments.map((s) => s.text).join("\n"); }
test("narrator only preserves text and order", () => { const r = a("Перший рядок.\n\nДругий рядок."); assert.deepEqual(r.segments.map(s=>s.type), ["narration","narration"]); assert.equal(texts(r), "Перший рядок.\nДругий рядок."); });
test("old man dialogue is inferred from attribution", () => { const r = a("Старий підвівся.\n— Я чекав, — хрипко сказав старий."); assert.equal(r.segments[1].speakerName, "Старий"); assert.equal(r.segments[1].voiceProfile, "male_elderly_rough"); });
test("young woman dialogue inference", () => { const r = a("— Ходімо, — відповіла дівчина."); assert.equal(r.segments[0].speakerName, "Дівчина"); assert.equal(r.segments[0].voiceProfile, "female_young_soft"); });
test("known two-person dialogue by name", () => { const r = a("— Так, — сказав Лін Фань.\n— Ні, — відповіла Мей.", [{ id:"1", canonical_name:"Лін Фань", display_name:"Лін Фань", aliases:[], voice_profile:"male_young_hero" }, { id:"2", canonical_name:"Мей", display_name:"Мей", aliases:[], voice_profile:"female_young_bright" }]); assert.equal(r.segments[0].speakerId, "1"); assert.equal(r.segments[1].speakerId, "2"); });
test("alternating unknown dialogue stays unresolved without evidence", () => { const r = a("— Привіт.\n— Хто тут?"); assert.equal(r.statistics.unresolvedSpeakers, 2); assert.equal(r.segments[0].speakerId, null); });
test("thoughts are recognized", () => { const r = a("Він подумав про себе: треба тікати."); assert.equal(r.segments[0].type, "thought"); });
test("system notifications are classified", () => { const r = a("[Система]: Рівень підвищено."); assert.equal(r.segments[0].type, "system"); assert.equal(r.segments[0].voiceProfile, "system_neutral"); });
test("emotional dialogue detects determined and angry without inventing", () => { const r = a("— Я не відступлю!\n— Геть! — люто закричав старий."); assert.equal(r.segments[0].emotion, "determined"); assert.equal(r.segments[1].emotion, "angry"); assert.ok(!texts(r).includes("missing")); });
test("mixed Ukrainian and Russian punctuation", () => { const r = a("— Я тут, — сказал старик.\n«Добре», — відповіла дівчина."); assert.equal(r.segments.length, 2); });
test("HTML chapter content is sanitized and preserves original text", () => { const clean = stripChapterHtml("<p>Старий.</p><p><em>Думка</em></p><script>bad()</script>"); assert.ok(!clean.includes("bad")); const r = a("<p>Старий.</p><p>— Так, — сказав старий.</p>"); assert.equal(r.segments[0].text, "Старий."); assert.equal(r.segments[1].text, "Так"); });
