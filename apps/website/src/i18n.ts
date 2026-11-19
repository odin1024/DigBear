export type Locale = "zh" | "en";

const STORAGE_KEY = "digbear-locale";
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
  // URL 参数优先：?lang=en / ?lang=zh
  // 这样分享出去的链接可以直接打开对应语言，收件人不用自己切。
  try {
    const param = new URLSearchParams(window.location.search).get("lang");
    if (param === "zh" || param === "en") return param;
  } catch {
    /* URL parsing may fail in odd environments */
  }
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