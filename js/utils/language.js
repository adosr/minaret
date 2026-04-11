export function detectLanguage() {
  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
    document.documentElement.lang
  ].filter(Boolean);

  const normalized = candidates.map((value) => String(value).toLowerCase());
  return normalized.some((value) => value === "ar" || value.startsWith("ar-")) ? "ar" : "en";
}

export function applyLanguageToDocument(language) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
}

export async function loadTranslations(language) {
  const res = await fetch(`./locales/${language}.json`);
  const dict = await res.json();

  return {
    language,
    dict,
    t: (key, fallback = "") => dict[key] ?? fallback
  };
}
