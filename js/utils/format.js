export function getDisplayLocale(lang) {
  const base = lang === "ar" ? "ar" : "en";
  return `${base}-u-nu-latn`;
}

export function formatDisplayTime(date, lang) {
  return new Intl.DateTimeFormat(getDisplayLocale(lang), {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

export function formatDisplayDate(date, lang) {
  return new Intl.DateTimeFormat(getDisplayLocale(lang), {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

export function formatMonthHeading(date, lang) {
  return new Intl.DateTimeFormat(getDisplayLocale(lang), {
    month: "long",
    year: "numeric"
  }).format(date);
}

export function minutesToDate(totalMinutes) {
  const d = new Date();
  d.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return d;
}
