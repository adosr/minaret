import { getJson, putJson, listKeys } from "../utils/kv.js";

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

export async function listSubscribers(env) {
  const list = await listSubscriptionKeys(env);
  const subscribers = [];

  for (const item of list.keys) {
    const record = await getSubscriptionRecord(env, item.name);
    if (!record) continue;
    subscribers.push({
      endpoint: record.subscription?.endpoint || null,
      name: record.name || null,
      language: record.language || null,
      timezone: record.timezone || null,
      userAgent: record.userAgent || null,
      createdAt: record.createdAt || null,
      lastSent: record.lastSent || null,
      customAttributes: record.customAttributes || null
    });
  }

  return subscribers;
}

export async function resolveRecordsByEndpoints(env, endpoints) {
  const records = [];

  for (const endpoint of endpoints || []) {
    const subKey = await subscriptionKey(endpoint);
    const record = await getSubscriptionRecord(env, subKey);
    if (record?.subscription?.endpoint) records.push({ subKey, record });
  }

  return records;
}
