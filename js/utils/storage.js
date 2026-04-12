import { STORAGE_KEYS } from "../../packages/shared/ids.js";

const LOCATION_EXPIRY = 24 * 60 * 60 * 1000;

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

export function persistNotificationsEnabled(value) {
  localStorage.setItem(STORAGE_KEYS.notifications, value ? "true" : "false");
}

export function loadAdminToken() {
  return localStorage.getItem(STORAGE_KEYS.adminToken) || "";
}

export function persistAdminToken(token) {
  if (token) localStorage.setItem(STORAGE_KEYS.adminToken, token);
  else localStorage.removeItem(STORAGE_KEYS.adminToken);
}