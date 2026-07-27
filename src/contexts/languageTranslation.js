import { catalogs } from "../i18n/catalogs";
import { normalizeLanguage } from "../lib/globalLanguage";

export function translate(language, key) {
  return catalogs[normalizeLanguage(language)]?.[key] || catalogs.en[key] || key;
}
