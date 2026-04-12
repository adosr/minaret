import { getJson, putJson, listKeys } from "../utils/kv.js";

const DEFAULT_NOTIFICATION_PREFS = {
  enabled: false,
  prayers: {
    fajr: true,
    dhuhr: true,
    asr: true,
    maghrib: true,
    isha: true
  }
};

export async function subscriptionKey(endpoint) {
  const bytes = new TextEncoder().encode(endpoint);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = [...new Uint8Array(hashBuffer)];
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sub:${hashHex}`;
}

export function sanitizeSettings(settings) {
  const s = settings || {};
  return {
    timezoneMinutes: Number.isFinite(s.timezoneMinutes) ? s.timezoneMinutes : 0,
    fajr: Number.isFinite(s.fajr) ? s.fajr : 0,
    sunrise: Number.isFinite(s.sunrise) ? s.sunrise : 0,
    dhuhr: Number.isFinite(s.dhuhr) ? s.dhuhr : 0,
    asr: Number.isFinite(s.asr) ? s.asr : 0,
    maghrib: Number.isFinite(s.maghrib) ? s.maghrib : 0,
    isha: Number.isFinite(s.isha) ? s.isha : 0
  };
}

export function sanitizeNotificationPreferences(value) {
  return {
    enabled: value?.enabled === true,
    prayers: {
      fajr: value?.prayers?.fajr !== false,
      dhuhr: value?.prayers?.dhuhr !== false,
      asr: value?.prayers?.asr !== false,
      maghrib: value?.prayers?.maghrib !== false,
      isha: value?.prayers?.isha !== false
    }
  };
}

export function getDefaultNotificationPreferences() {
  return structuredClone(DEFAULT_NOTIFICATION_PREFS);
}

export function sanitizeLanguage(language) {
  return language === "ar" ? "ar" : "en";
}

export function sanitizeTimeZone(timeZone) {
  const candidate = typeof timeZone === "string" ? timeZone.trim() : "";

  if (!candidate) return "UTC";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

export function sanitizeName(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 180);
}

export function sanitizeUserAgent(userAgent) {
  if (typeof userAgent !== "string") return null;
  const trimmed = userAgent.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 512);
}

export function sanitizeCoordinates(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

export function isValidPushSubscription(subscription) {
  return Boolean(
    subscription &&
    typeof subscription === "object" &&
    typeof subscription.endpoint === "string" &&
    subscription.endpoint.trim()
  );
}

export async function getSubscriptionRecord(env, subKey) {
  return getJson(env, subKey, null);
}

export async function putSubscriptionRecord(env, subKey, record) {
  await putJson(env, subKey, record);
}

export async function deleteSubscriptionRecord(env, subKey) {
  await env.SUBSCRIPTIONS.delete(subKey);
}

export async function listSubscriptionKeys(env) {
  return listKeys(env, "sub:", 1000);
}
