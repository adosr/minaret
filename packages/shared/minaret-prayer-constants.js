export const MINARET_FAJR_ANGLE = 18.5;
export const MINARET_DHUHR_BUFFER_MINUTES = 1;
export const MINARET_MAGHRIB_BUFFER_MINUTES = 1;
export const MINARET_ISHA_OFFSET_HOURS = 1.5;

export function getMinaretPrayerLabel(prayer, language = "en") {
  const labels = {
    ar: {
      fajr: "الفجر",
      sunrise: "الشروق",
      dhuhr: "الظهر",
      asr: "العصر",
      maghrib: "المغرب",
      isha: "العشاء"
    },
    en: {
      fajr: "Fajr",
      sunrise: "Sunrise",
      dhuhr: "Dhuhr",
      asr: "Asr",
      maghrib: "Maghrib",
      isha: "Isha"
    }
  };
  return (labels[language] || labels.en)[prayer] || prayer;
}
