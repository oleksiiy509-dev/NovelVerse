import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { catalogs } from "../i18n/catalogs";
import { DEFAULT_LANGUAGE, detectLanguage, normalizeLanguage } from "../lib/globalLanguage";
import { useTelegram } from "../hooks/useTelegram";

const STORAGE_KEY = "novelverse:language-preferences:v1";
const defaults = { interfaceLanguage: DEFAULT_LANGUAGE, readingLanguage: DEFAULT_LANGUAGE, audioLanguage: DEFAULT_LANGUAGE, autoDetect: true };
const LanguageContext = createContext(null);

function readPreferences() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; } catch { return defaults; }
}

export function LanguageProvider({ children }) {
  const { user } = useTelegram();
  const [preferences, setPreferences] = useState(readPreferences);
  const detected = detectLanguage({ telegramLanguageCode: user?.language_code, deviceLanguage: navigator.languages?.[0], browserLanguage: navigator.language });

  useEffect(() => {
    if (!preferences.autoDetect) return;
    setPreferences((current) => ({ ...current, interfaceLanguage: detected, readingLanguage: detected, audioLanguage: detected }));
  }, [detected, preferences.autoDetect]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    document.documentElement.lang = preferences.interfaceLanguage;
  }, [preferences]);

  const value = useMemo(() => ({
    preferences, detectedLanguage: detected,
    setPreferences: (next) => setPreferences((current) => ({ ...current, ...next })),
    t: (key) => catalogs[normalizeLanguage(preferences.interfaceLanguage)]?.[key] || catalogs.en[key] || key,
  }), [preferences, detected]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
