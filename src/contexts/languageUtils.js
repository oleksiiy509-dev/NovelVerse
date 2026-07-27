import { DEFAULT_LANGUAGE } from "../lib/globalLanguage.js";

export const LANGUAGE_PREFERENCES_STORAGE_KEY = "novelverse:language-preferences:v1";

export const DEFAULT_LANGUAGE_PREFERENCES = {
  interfaceLanguage: DEFAULT_LANGUAGE,
  readingLanguage: DEFAULT_LANGUAGE,
  audioLanguage: DEFAULT_LANGUAGE,
  autoDetect: true,
};

export function readLanguagePreferences(storage = localStorage) {
  try {
    return {
      ...DEFAULT_LANGUAGE_PREFERENCES,
      ...JSON.parse(storage.getItem(LANGUAGE_PREFERENCES_STORAGE_KEY) || "{}"),
    };
  } catch {
    return DEFAULT_LANGUAGE_PREFERENCES;
  }
}

export function applyDetectedLanguage(preferences, detectedLanguage) {
  if (!preferences.autoDetect) return preferences;

  return {
    ...preferences,
    interfaceLanguage: detectedLanguage,
    readingLanguage: detectedLanguage,
    audioLanguage: detectedLanguage,
  };
}
