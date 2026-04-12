import { json, safeJson } from "../utils/response.js";
import {
  subscriptionKey,
  getSubscriptionRecord,
  putSubscriptionRecord,
  sanitizeSettings,
  sanitizeNotificationPreferences,
  sanitizeLanguage,
  sanitizeTimeZone,
  sanitizeName,
  sanitizeUserAgent,
  sanitizeCoordinates,
  isValidPushSubscription
} from "../services/subscription-service.js";
import { rebuildSubscriptionSchedule, removeSubscriptionCompletely } from "../services/notification-service.js";

export async function handleUpsertNotificationSubscription(request, env) {
  const body = await safeJson(request);
  const subscription = body?.subscription;

  if (!isValidPushSubscription(subscription)) {
    return json({ ok: false, error: "Missing or invalid subscription." }, 400);
  }

  const coords = sanitizeCoordinates(body?.lat, body?.lon);
  if (!coords) {
    return json({ ok: false, error: "Missing or invalid coordinates." }, 400);
  }

  const subKey = await subscriptionKey(subscription.endpoint);
  const existing = await getSubscriptionRecord(env, subKey);
  const now = new Date().toISOString();
  const notificationPrefs = sanitizeNotificationPreferences(body?.notificationPrefs);

  const record = {
    subscription,
    name: sanitizeName(body?.name),
    language: sanitizeLanguage(body?.language),
    timezone: sanitizeTimeZone(body?.timezone),
    lat: coords.lat,
    lon: coords.lon,
    settings: sanitizeSettings(body?.settings),
    notificationPrefs,
    userAgent: sanitizeUserAgent(body?.userAgent),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastNotification: existing?.lastNotification || null,
    scheduleDate: existing?.scheduleDate || null,
    scheduledKeys: existing?.scheduledKeys || [],
    scheduleMeta: existing?.scheduleMeta || {}
  };

  if (notificationPrefs.enabled) {
    await rebuildSubscriptionSchedule(env, subKey, record, new Date());
  } else {
    if (existing?.scheduledKeys?.length) {
      await removeSubscriptionCompletely(env, subKey, { ...existing, subscription });
    }
    record.scheduleDate = null;
    record.scheduledKeys = [];
    record.scheduleMeta = {};
    await putSubscriptionRecord(env, subKey, record);
  }

  return json({
    ok: true,
    key: subKey,
    status: existing ? "updated" : "created",
    notificationPrefs: record.notificationPrefs,
    scheduleDate: record.scheduleDate,
    scheduledKeys: record.scheduledKeys?.length || 0
  });
}

export async function handleDeleteNotificationSubscription(request, env) {
  const body = await safeJson(request);
  const endpoint = body?.endpoint;

  if (typeof endpoint !== "string" || !endpoint.trim()) {
    return json({ ok: false, error: "Missing endpoint." }, 400);
  }

  const subKey = await subscriptionKey(endpoint);
  const existing = await getSubscriptionRecord(env, subKey);
  await removeSubscriptionCompletely(env, subKey, existing);

  return json({ ok: true, key: subKey, deleted: true });
}
