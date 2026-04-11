import { json, safeJson } from "../utils/response.js";
import { subscriptionKey, getSubscriptionRecord, putSubscriptionRecord, sanitizeSettings } from "../services/subscription-service.js";
import { buildInitialBuckets, removeScheduledBucketsForRecord } from "../services/bucket-service.js";

export async function handleSubscribe(request, env) {
  const body = await safeJson(request);

  if (!body?.subscription?.endpoint) {
    return json({ error: "Invalid subscription payload" }, 400);
  }

  const subKey = await subscriptionKey(body.subscription.endpoint);
  const existing = await getSubscriptionRecord(env, subKey);

  if (existing) {
    await removeScheduledBucketsForRecord(env, subKey, existing, 7);
  }

  const record = {
    subscription: body.subscription,
    lat: body.lat ?? null,
    lon: body.lon ?? null,
    timezone: body.timezone ?? null,
    language: body.language ?? "ar",
    name: body.name ?? null,
    userAgent: body.userAgent ?? null,
    settings: sanitizeSettings(body.settings),
    customAttributes: body.customAttributes ?? existing?.customAttributes ?? {},
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSent: existing?.lastSent ?? null,
    scheduleVersion: Date.now()
  };

  await putSubscriptionRecord(env, subKey, record);
  await buildInitialBuckets(env, subKey, record, 7);

  return json({ ok: true, key: subKey, message: "Subscription saved" });
}
