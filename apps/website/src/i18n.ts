export type Locale = "zh" | "en";

const STORAGE_KEY = "crawl-bear-locale";
let currentLocale: Locale = "zh";

export function detectLocale(): Locale {
  try {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    const first = languages.find(Boolean) || "zh";
    return first.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "zh";
  }
}

export function loadLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "zh" || stored === "en") return stored;
  } catch {
    /* storage may be unavailable */
  }
  return detectLocale();
}

export function setLocale(locale: Locale) {
  currentLocale = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(zh: string, en: string): string {
  return currentLocale === "en" ? en : zh;
}
