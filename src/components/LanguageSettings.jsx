import { SUPPORTED_LANGUAGES } from "../lib/globalLanguage";
import { useLanguage } from "../contexts/LanguageContext";

export default function LanguageSettings() {
  const { preferences, setPreferences, detectedLanguage, t } = useLanguage();
  const select = (key) => <select value={preferences[key]} disabled={preferences.autoDetect} onChange={(event) => setPreferences({ [key]: event.target.value })}>{SUPPORTED_LANGUAGES.map((language) => <option value={language.code} key={language.code}>{language.nativeName}</option>)}</select>;
  return <section className="language-settings">
    <h2>🌐 {t("languageSettings")}</h2>
    <p className="language-settings__detected">Auto-detected: {SUPPORTED_LANGUAGES.find(({ code }) => code === detectedLanguage)?.nativeName}</p>
    <label className="language-settings__toggle"><input type="checkbox" checked={preferences.autoDetect} onChange={(event) => setPreferences({ autoDetect: event.target.checked })} /> {t("autoDetect")}</label>
    <div className="language-settings__grid"><label>{t("interfaceLanguage")}{select("interfaceLanguage")}</label><label>{t("readingLanguage")}{select("readingLanguage")}</label><label>{t("audioLanguage")}{select("audioLanguage")}</label></div>
    <small>Preferences are saved automatically on this device.</small>
  </section>;
}
