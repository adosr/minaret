import { STORAGE_KEYS } from "../../packages/shared/ids.js";

const LOCATION_EXPIRY = 24 * 60 * 60 * 1000;
const LEGACY_NOTIFICATION_KEY = "prayer_notifications_enabled";

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  enabled: false,
  prayers: {
    fajr: true,
    dhuhr: true,
    asr: true,
    maghrib: true,
    isha: true
  }
};

export function loadSavedLocation() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.location));
    if (!raw || !Number.isFinite(raw.lat) || !Number.isFinite(raw.lon)) return null;

    if (!Number.isFinite(raw.timestamp)) return null;
    if (Date.now() - raw.timestamp > LOCATION_EXPIRY) return null;

    return {
      lat: raw.lat,
      lon: raw.lon,
      nameAr: raw.nameAr || null,
      nameEn: raw.nameEn || null
    };
  } catch {
    return null;
  }
}

export function persistLocation({ lat, lon, nameAr, nameEn }) {
  localStorage.setItem(
    STORAGE_KEYS.location,
    JSON.stringify({
      lat,
      lon,
      nameAr,
      nameEn,
      timestamp: Date.now()
    })
  );
}

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}");
    return {
      timezoneMinutes: Number.isFinite(s.timezoneMinutes) ? s.timezoneMinutes : 0,
      fajr: Number.isFinite(s.fajr) ? s.fajr : 0,
      sunrise: Number.isFinite(s.sunrise) ? s.sunrise : 0,
      dhuhr: Number.isFinite(s.dhuhr) ? s.dhuhr : 0,
      asr: Number.isFinite(s.asr) ? s.asr : 0,
      maghrib: Number.isFinite(s.maghrib) ? s.maghrib : 0,
      isha: Number.isFinite(s.isha) ? s.isha : 0
    };
  } catch {
    return {
      timezoneMinutes: 0,
      fajr: 0,
      sunrise: 0,
      dhuhr: 0,
      asr: 0,
      maghrib: 0,
      isha: 0
    };
  }
}

export function loadNotificationPreferences() {
  clearLegacyNotificationStorage();

  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.notificationPreferences) || "{}");
    return {
      enabled: raw.enabled === true,
      prayers: {
        fajr: raw?.prayers?.fajr !== false,
        dhuhr: raw?.prayers?.dhuhr !== false,
        asr: raw?.prayers?.asr !== false,
        maghrib: raw?.prayers?.maghrib !== false,
        isha: raw?.prayers?.isha !== false
      }
    };
  } catch {
    return structuredClone(DEFAULT_NOTIFICATION_PREFERENCES);
  }
}

export function persistNotificationPreferences(value) {
  const prefs = {
    enabled: value?.enabled === true,
    prayers: {
      fajr: value?.prayers?.fajr !== false,
      dhuhr: value?.prayers?.dhuhr !== false,
      asr: value?.prayers?.asr !== false,
      maghrib: value?.prayers?.maghrib !== false,
      isha: value?.prayers?.isha !== false
    }
  };

  localStorage.setItem(STORAGE_KEYS.notificationPreferences, JSON.stringify(prefs));
  localStorage.removeItem(LEGACY_NOTIFICATION_KEY);
}

export function clearLegacyNotificationStorage() {
  localStorage.removeItem(LEGACY_NOTIFICATION_KEY);
}

export function loadAdminToken() {
  return localStorage.getItem(STORAGE_KEYS.adminToken) || "";
}

export function persistAdminToken(token) {
  if (token) localStorage.setItem(STORAGE_KEYS.adminToken, token);
  else localStorage.removeItem(STORAGE_KEYS.adminToken);
}
