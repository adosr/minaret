export function detectLanguage() {
  const documentLang = String(document.documentElement.lang || "").toLowerCase();

  const explicitDocumentLang =
    documentLang === "ar" || documentLang.startsWith("ar-")
      ? "ar"
      : documentLang === "en" || documentLang.startsWith("en-")
        ? "en"
        : null;

  const firstBrowserLang = String(
    (Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages[0]
      : navigator.language || "")
  ).toLowerCase();

  const browserLang =
    firstBrowserLang === "ar" || firstBrowserLang.startsWith("ar-")
      ? "ar"
      : "en";

  return explicitDocumentLang || browserLang;
}

export function applyLanguageToDocument(language) {
  const resolvedLanguage = language === "ar" ? "ar" : "en";
  document.documentElement.lang = resolvedLanguage;
  document.documentElement.dir = resolvedLanguage === "ar" ? "rtl" : "ltr";
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
  const requestedLanguage = language === "ar" ? "ar" : "en";
  const fallbackLanguage = requestedLanguage === "ar" ? "en" : "ar";

  try {
    const dict = await loadTranslationFile(requestedLanguage);
    applyLanguageToDocument(requestedLanguage);

    return {
      language: requestedLanguage,
      dict,
      t: (key, fallback = "") => dict[key] ?? fallback
    };
  } catch (primaryError) {
    console.warn(
      `Failed to load ${requestedLanguage} translations. Trying ${fallbackLanguage}.`,
      primaryError
    );

    try {
      const dict = await loadTranslationFile(fallbackLanguage);
      applyLanguageToDocument(fallbackLanguage);

      return {
        language: fallbackLanguage,
        dict,
        t: (key, fallback = "") => dict[key] ?? fallback
      };
    } catch (fallbackError) {
      console.error("Failed to load both translation files.", {
        requestedLanguage,
        fallbackLanguage,
        primaryError,
        fallbackError
      });

      applyLanguageToDocument(requestedLanguage);

      return {
        language: requestedLanguage,
        dict: {},
        t: (key, fallback = "") => fallback
      };
    }
  }
}