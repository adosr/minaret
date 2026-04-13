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

  const dict = await res.json();
  return dict && typeof dict === "object" ? dict : {};
}

export async function loadTranslations(language) {
  const primaryLanguage = language === "ar" ? "ar" : "en";
  const fallbackLanguage = primaryLanguage === "ar" ? "en" : "ar";

  let resolvedLanguage = primaryLanguage;
  let dict = {};

  try {
    dict = await loadTranslationFile(primaryLanguage);
  } catch (primaryError) {
    try {
      dict = await loadTranslationFile(fallbackLanguage);
      resolvedLanguage = fallbackLanguage;
    } catch (fallbackError) {
      console.error("Failed to load both translation files.", {
        primaryLanguage,
        fallbackLanguage,
        primaryError,
        fallbackError
      });

      dict = {};
      resolvedLanguage = primaryLanguage;
    }
  }

  applyLanguageToDocument(resolvedLanguage);

  return {
    language: resolvedLanguage,
    dict,
    t: (key, fallback = "") => dict[key] ?? fallback
  };
}