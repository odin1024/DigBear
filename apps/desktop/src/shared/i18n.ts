export type Locale = "zh" | "en";
export type LanguageSetting = "auto" | Locale;

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

export function resolveLocale(setting: LanguageSetting | null | undefined): Locale {
  if (setting === "zh" || setting === "en") return setting;
  return detectLocale();
}

export function setLocale(locale: Locale) {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(zh: string, en: string, vars?: Record<string, string | number>): string {
  let text = currentLocale === "en" ? en : zh;
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      text = text.split(`{${key}}`).join(String(value));
    }
  }
  return text;
}
