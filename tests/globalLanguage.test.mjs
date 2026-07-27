import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLanguageAnalytics, createBookLanguageVersion, detectLanguage, languageFallbacks, localizeApiResponse,
  localizeNotification, searchLocalizedBooks, selectAudioVersion, selectVoice, transitionTranslation,
} from "../src/lib/globalLanguage.js";
import { catalogs } from "../src/i18n/catalogs.js";
import {
  applyDetectedLanguage,
  DEFAULT_LANGUAGE_PREFERENCES,
  LANGUAGE_PREFERENCES_STORAGE_KEY,
  readLanguagePreferences,
  writeLanguagePreferences,
} from "../src/contexts/languageUtils.js";

test("language detection follows Telegram, device, browser, English priority", () => {
  assert.equal(detectLanguage({ telegramLanguageCode: "uk-UA", deviceLanguage: "de-DE", browserLanguage: "es" }), "uk");
  assert.equal(detectLanguage({ telegramLanguageCode: "xx", deviceLanguage: "de-DE", browserLanguage: "es" }), "de");
  assert.equal(detectLanguage({}), "en");
});

test("language preferences apply automatic detection without mutating saved preferences", () => {
  const saved = { ...DEFAULT_LANGUAGE_PREFERENCES, readingLanguage: "es" };
  const detected = applyDetectedLanguage(saved, "uk");
  assert.deepEqual(detected, { ...saved, interfaceLanguage: "uk", readingLanguage: "uk", audioLanguage: "uk" });
  assert.equal(saved.readingLanguage, "es");
  assert.equal(applyDetectedLanguage({ ...saved, autoDetect: false }, "uk").readingLanguage, "es");
});

test("language preferences load persisted values and recover malformed storage", () => {
  const storage = { getItem: (key) => key === LANGUAGE_PREFERENCES_STORAGE_KEY ? '{"readingLanguage":"de"}' : null };
  assert.equal(readLanguagePreferences(storage).readingLanguage, "de");
  assert.deepEqual(readLanguagePreferences({ getItem: () => "{" }), DEFAULT_LANGUAGE_PREFERENCES);
});

test("language preferences handle unavailable storage without crashing", () => {
  let persisted;
  const storage = { setItem: (key, value) => { persisted = [key, value]; } };
  assert.equal(writeLanguagePreferences({ readingLanguage: "de" }, storage), true);
  assert.deepEqual(persisted, [LANGUAGE_PREFERENCES_STORAGE_KEY, '{"readingLanguage":"de"}']);
  assert.equal(writeLanguagePreferences({}, { setItem: () => { throw new Error("quota exceeded"); } }), false);
});

test("content and audio fall back preferred, English, original", () => {
  assert.deepEqual(languageFallbacks("es", "uk"), ["es", "en", "uk"]);
  const audio = selectAudioVersion({ en: { src: "english.mp3" }, uk: { src: "original.mp3" } }, "de", "uk");
  assert.equal(audio.src, "english.mp3");
  assert.equal(audio.language, "en");
});

test("book versions preserve localized fields", () => {
  const version = createBookLanguageVersion("ja", { title: "星", chapters: [{ title: "一" }], keywords: ["宇宙"] });
  assert.equal(version.language, "ja"); assert.equal(version.chapters.length, 1); assert.deepEqual(version.audio, []);
});

test("translation workflow enforces its quality gates", () => {
  let item = { status: "draft" };
  for (const status of ["machine_translation", "human_review", "approved", "published"]) item = transitionTranslation(item, status, "editor");
  assert.equal(item.status, "published"); assert.equal(item.history.length, 4);
  assert.throws(() => transitionTranslation({ status: "draft" }, "published"), /Invalid/);
});

test("voice selection supports defaults, premium and English fallback", () => {
  const voices = { en: { defaultMale: "alloy", defaultFemale: "nova", premium: ["aria"] }, uk: { defaultFemale: "solomia" } };
  assert.equal(selectVoice(voices, "uk", { gender: "female" }), "solomia");
  assert.equal(selectVoice(voices, "de", { premium: true }), "aria");
});

test("all supported localized UI catalogs contain every English key", () => {
  for (const catalog of Object.values(catalogs)) assert.deepEqual(Object.keys(catalog).sort(), Object.keys(catalogs.en).sort());
});

test("search indexes every localized field", () => {
  const books = [{ id: 1, languages: { en: { title: "The Sun" }, es: { title: "El Sol", keywords: ["estrella"] } } }, { id: 2, languages: { en: { title: "Moon" } } }];
  assert.deepEqual(searchLocalizedBooks(books, "estrella", "es").map(({ id }) => id), [1]);
});

test("notifications and API responses localize with fallback metadata", () => {
  const translations = { en: { title: "New chapter" }, de: { title: "Neues Kapitel" } };
  assert.equal(localizeNotification({ translations }, "de").title, "Neues Kapitel");
  const response = localizeApiResponse({ originalLanguage: "en", languages: translations }, { readingLanguage: "ja" });
  assert.equal(response.title, "New chapter"); assert.equal(response.localization.resolved, "en");
});

test("analytics reports languages, countries, playback and conversions", () => {
  const result = buildLanguageAnalytics([{ language: "es", country: "ES", audioLanguage: "es", converted: true }, { language: "es", country: "MX", audioLanguage: "en" }]);
  assert.deepEqual(result.topLanguages[0], { key: "es", value: 2 }); assert.equal(result.conversionByLanguage[0].rate, .5);
});
