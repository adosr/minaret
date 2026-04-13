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

async function loadTranslationFile(language) {
  const res = await fetch(`./locales/${language}.json`, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Failed to load ${language} translations (HTTP ${res.status})`);
  }
  return await res.json();
}

export async function loadTranslations(language) {
  let resolvedLanguage = language === "ar" ? "ar" : "en";
  let dict = null;

  try {
    dict = await loadTranslationFile(resolvedLanguage);
  } catch (primaryError) {
    if (resolvedLanguage !== "en") {
      dict = await loadTranslationFile("en");
      resolvedLanguage = "en";
    } else {
      throw primaryError;
    }
  }

  return {
    language: resolvedLanguage,
    dict,
    t: (key, fallback = "") => dict[key] ?? fallback
  };
}
