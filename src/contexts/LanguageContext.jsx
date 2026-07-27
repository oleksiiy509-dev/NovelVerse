import { useCallback, useEffect, useMemo, useState } from "react";
import { catalogs } from "../i18n/catalogs";
import { detectLanguage, normalizeLanguage } from "../lib/globalLanguage";
import { useTelegram } from "../hooks/useTelegram";
import { applyDetectedLanguage, readLanguagePreferences, writeLanguagePreferences } from "./languageUtils";
import { LanguageContext } from "./LanguageContextValue";

export function LanguageProvider({ children }) {
  const { user } = useTelegram();
  const [savedPreferences, setSavedPreferences] = useState(readLanguagePreferences);
  const telegramLanguageCode = user?.language_code;
  const detected = useMemo(() => detectLanguage({
    telegramLanguageCode,
    deviceLanguage: navigator.languages?.[0],
    browserLanguage: navigator.language,
  }), [telegramLanguageCode]);
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
    writeLanguagePreferences(preferences);
    document.documentElement.lang = preferences.interfaceLanguage;
  }, [preferences]);

  const value = useMemo(() => ({
    preferences, detectedLanguage: detected,
    setPreferences,
    t: (key) => catalogs[normalizeLanguage(preferences.interfaceLanguage)]?.[key] || catalogs.en[key] || key,
  }), [preferences, detected, setPreferences]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
