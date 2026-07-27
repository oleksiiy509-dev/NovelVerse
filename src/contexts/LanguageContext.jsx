import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { catalogs } from "../i18n/catalogs";
import { detectLanguage, normalizeLanguage } from "../lib/globalLanguage";
import { useTelegram } from "../hooks/useTelegram";
import { applyDetectedLanguage, LANGUAGE_PREFERENCES_STORAGE_KEY, readLanguagePreferences } from "./languageUtils";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const { user } = useTelegram();
  const [savedPreferences, setSavedPreferences] = useState(readLanguagePreferences);
  const detected = detectLanguage({ telegramLanguageCode: user?.language_code, deviceLanguage: navigator.languages?.[0], browserLanguage: navigator.language });
  const preferences = useMemo(
    () => applyDetectedLanguage(savedPreferences, detected),
    [savedPreferences, detected],
  );

  const setPreferences = useCallback((next) => {
    setSavedPreferences((current) => ({
      ...applyDetectedLanguage(current, detected),
      ...next,
    }));
  }, [detected]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    document.documentElement.lang = preferences.interfaceLanguage;
  }, [preferences]);

  const value = useMemo(() => ({
    preferences, detectedLanguage: detected,
    setPreferences,
    t: (key) => catalogs[normalizeLanguage(preferences.interfaceLanguage)]?.[key] || catalogs.en[key] || key,
  }), [preferences, detected, setPreferences]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
