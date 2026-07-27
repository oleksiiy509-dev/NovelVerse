export const DEFAULT_LANGUAGE = "en";

export const SUPPORTED_LANGUAGES = Object.freeze([
  { code: "en", name: "English", nativeName: "English", direction: "ltr" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", direction: "ltr" },
  { code: "ru", name: "Russian", nativeName: "Русский", direction: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", direction: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", direction: "ltr" },
  { code: "ja", name: "Japanese", nativeName: "日本語", direction: "ltr" },
]);

const supportedCodes = new Set(SUPPORTED_LANGUAGES.map(({ code }) => code));

export function normalizeLanguage(value) {
  if (!value || typeof value !== "string") return null;
  const code = value.trim().toLowerCase().replace("_", "-").split("-")[0];
  return supportedCodes.has(code) ? code : null;
}

export function detectLanguage({ telegramLanguageCode, deviceLanguage, browserLanguage } = {}) {
  return normalizeLanguage(telegramLanguageCode)
    || normalizeLanguage(deviceLanguage)
    || normalizeLanguage(browserLanguage)
    || DEFAULT_LANGUAGE;
}

export function languageFallbacks(preferred, originalLanguage) {
  return [...new Set([
    normalizeLanguage(preferred) || DEFAULT_LANGUAGE,
    DEFAULT_LANGUAGE,
    normalizeLanguage(originalLanguage),
  ].filter(Boolean))];
}

export function selectLanguageVersion(versions, preferred, originalLanguage) {
  if (!versions) return null;
  const entries = Array.isArray(versions)
    ? versions.map((version) => [normalizeLanguage(version.language || version.languageCode), version])
    : Object.entries(versions).map(([code, version]) => [normalizeLanguage(code), version]);
  const byLanguage = new Map(entries.filter(([code]) => code));
  for (const code of languageFallbacks(preferred, originalLanguage)) {
    if (byLanguage.has(code)) return { ...byLanguage.get(code), language: code };
  }
  const first = entries.find(([code]) => code);
  return first ? { ...first[1], language: first[0] } : null;
}

export const selectAudioVersion = selectLanguageVersion;

export function createBookLanguageVersion(language, content = {}) {
  const code = normalizeLanguage(language);
  if (!code) throw new Error("Unsupported language");
  return {
    language: code,
    title: "", description: "", metadata: {}, chapters: [], audio: [], cover: "", keywords: [],
    status: "draft",
    ...content,
  };
}

export const TRANSLATION_STATES = Object.freeze([
  "draft", "machine_translation", "human_review", "approved", "published",
]);

const transitions = {
  draft: ["machine_translation"],
  machine_translation: ["human_review", "draft"],
  human_review: ["approved", "machine_translation"],
  approved: ["published", "human_review"],
  published: ["human_review"],
};

export function transitionTranslation(translation, nextStatus, actor = "system") {
  const current = translation?.status || "draft";
  if (!TRANSLATION_STATES.includes(nextStatus) || !transitions[current]?.includes(nextStatus)) {
    throw new Error(`Invalid translation transition: ${current} → ${nextStatus}`);
  }
  const event = { from: current, to: nextStatus, actor, at: new Date().toISOString() };
  return { ...translation, status: nextStatus, history: [...(translation.history || []), event] };
}

export function selectVoice(voiceMap, language, { gender, premium = false } = {}) {
  const code = normalizeLanguage(language) || DEFAULT_LANGUAGE;
  const mapping = voiceMap?.[code] || voiceMap?.[DEFAULT_LANGUAGE];
  if (!mapping) return null;
  if (premium && mapping.premium?.length) return mapping.premium[0];
  if (gender === "female" && mapping.defaultFemale) return mapping.defaultFemale;
  if (gender === "male" && mapping.defaultMale) return mapping.defaultMale;
  return mapping.defaultFemale || mapping.defaultMale || mapping.premium?.[0] || null;
}

export function searchLocalizedBooks(books, query, language) {
  const needle = String(query || "").trim().toLocaleLowerCase(language);
  if (!needle) return books;
  return books.filter((book) => Object.entries(book.languages || {}).some(([code, version]) => {
    const searchable = [version.title, version.description, ...(version.keywords || []), ...Object.values(version.metadata || {})]
      .filter(Boolean).join(" ").toLocaleLowerCase(code);
    return searchable.includes(needle);
  }));
}

export function localizeNotification(notification, language, originalLanguage = DEFAULT_LANGUAGE) {
  const content = selectLanguageVersion(notification?.translations, language, originalLanguage);
  return content ? { ...notification, ...content, selectedLanguage: content.language } : notification;
}

export function buildLanguageAnalytics(events = []) {
  const count = (field) => Object.entries(events.reduce((totals, event) => {
    const key = event[field] || "unknown"; totals[key] = (totals[key] || 0) + 1; return totals;
  }, {})).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, value }));
  const conversions = {};
  for (const event of events) {
    const language = event.language || "unknown";
    conversions[language] ||= { visits: 0, conversions: 0 };
    conversions[language].visits += 1;
    if (event.converted) conversions[language].conversions += 1;
  }
  return {
    topLanguages: count("language"), topCountries: count("country"), mostPlayedLanguages: count("audioLanguage"),
    conversionByLanguage: Object.entries(conversions).map(([language, values]) => ({ language, ...values, rate: values.visits ? values.conversions / values.visits : 0 })),
  };
}

export function localizeApiResponse(book, preferences = {}) {
  const version = selectLanguageVersion(book.languages, preferences.readingLanguage || preferences.interfaceLanguage, book.originalLanguage);
  return { ...book, ...version, availableLanguages: Object.keys(book.languages || {}), localization: { requested: preferences.readingLanguage || preferences.interfaceLanguage || DEFAULT_LANGUAGE, resolved: version?.language || null } };
}
