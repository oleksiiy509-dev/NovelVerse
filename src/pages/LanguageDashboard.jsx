import { useMemo, useState } from "react";
import { SUPPORTED_LANGUAGES, buildLanguageAnalytics } from "../lib/globalLanguage";
import { useLanguage } from "../hooks/useLanguage";
import "../styles/LanguagePlatform.css";

const coverage = {
  en: ["available", "available", "available", "available"], uk: ["available", "available", "inProgress", "available"],
  ru: ["available", "inProgress", "available", "available"], es: ["available", "inProgress", "missing", "inProgress"],
  de: ["available", "inProgress", "missing", "inProgress"], ja: ["available", "missing", "missing", "inProgress"],
};
const areas = ["UI", "Books", "Audio", "Notifications"];
const statusIcon = { available: "✔", inProgress: "⏳", missing: "❌" };

export default function LanguageDashboard() {
  const { t } = useLanguage();
  const [tab, setTab] = useState("coverage");
  const analytics = useMemo(() => buildLanguageAnalytics([
    { language: "en", country: "US", audioLanguage: "en", converted: true }, { language: "en", country: "GB", audioLanguage: "en" },
    { language: "uk", country: "UA", audioLanguage: "uk", converted: true }, { language: "es", country: "ES", audioLanguage: "es" },
  ]), []);
  return <main className="language-dashboard page-shell">
    <header><div><span className="eyebrow">NOVELVERSE GLOBAL</span><h1>🌐 {t("languageDashboard")}</h1><p>Manage content coverage, translation quality, voices and worldwide performance.</p></div><span className="coverage-score">6 <small>supported languages</small></span></header>
    <nav className="language-tabs"><button className={tab === "coverage" ? "active" : ""} onClick={() => setTab("coverage")}>Coverage</button><button className={tab === "workflow" ? "active" : ""} onClick={() => setTab("workflow")}>{t("translationWorkflow")}</button><button className={tab === "voices" ? "active" : ""} onClick={() => setTab("voices")}>{t("voiceMapping")}</button><button className={tab === "analytics" ? "active" : ""} onClick={() => setTab("analytics")}>{t("analytics")}</button></nav>
    {tab === "coverage" && <section className="language-card"><table><thead><tr><th>Language</th>{areas.map((area) => <th key={area}>{area}</th>)}</tr></thead><tbody>{SUPPORTED_LANGUAGES.map((language) => <tr key={language.code}><td><b>{language.nativeName}</b><small>{language.name} · {language.code.toUpperCase()}</small></td>{coverage[language.code].map((status, index) => <td key={areas[index]}><span className={`language-status ${status}`}>{statusIcon[status]} {t(status)}</span></td>)}</tr>)}</tbody></table></section>}
    {tab === "workflow" && <section className="workflow-row">{["Draft", "Machine Translation", "Human Review", "Approved", "Published"].map((state, index) => <article key={state}><i>{index + 1}</i><b>{state}</b><small>{index === 0 ? "Authoring" : index === 1 ? "AI generated" : index === 2 ? "Linguist review" : index === 3 ? "Quality gate passed" : "Live to readers"}</small></article>)}</section>}
    {tab === "voices" && <section className="language-card voice-table"><h2>Voice defaults</h2>{SUPPORTED_LANGUAGES.map((language) => <div key={language.code}><b>{language.nativeName}</b><span>♂ {language.code.toUpperCase()} Standard Male</span><span>♀ {language.code.toUpperCase()} Standard Female</span><span>✦ {language.code === "en" || language.code === "ja" ? "3 premium" : "1 premium"}</span></div>)}</section>}
    {tab === "analytics" && <section className="analytics-grid"><article><small>Top language</small><strong>{analytics.topLanguages[0].key.toUpperCase()}</strong><span>{analytics.topLanguages[0].value} sessions</span></article><article><small>Top country</small><strong>{analytics.topCountries[0].key}</strong><span>{analytics.topCountries[0].value} sessions</span></article><article><small>Most played</small><strong>{analytics.mostPlayedLanguages[0].key.toUpperCase()}</strong><span>{analytics.mostPlayedLanguages[0].value} plays</span></article><article><small>Best conversion</small><strong>{Math.max(...analytics.conversionByLanguage.map((item) => item.rate)) * 100}%</strong><span>by language</span></article></section>}
  </main>;
}
