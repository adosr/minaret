import { json, safeJson } from "../utils/response.js";
import { listSubscriptionKeys, getSubscriptionRecord, listSubscribers, subscriptionKey, putSubscriptionRecord, sanitizeSettings } from "../services/subscription-service.js";
import { removeScheduledBucketsForRecord, buildInitialBuckets } from "../services/bucket-service.js";

export async function handleSummary(env) {
  const subs = await env.SUBSCRIPTIONS.list({ prefix: "sub:", limit: 1000 });
  const jobs = await env.SUBSCRIPTIONS.list({ prefix: "bucket:", limit: 1000 });

  return json({
    ok: true,
    subscriptions: subs.keys.length,
    subscriptions_complete: subs.list_complete,
    buckets: jobs.keys.length,
    buckets_complete: jobs.list_complete,
    now_utc: new Date().toISOString()
  });
}

export async function handleSubscribers(env) {
  return json({
    ok: true,
    subscribers: await listSubscribers(env)
  });
}

export async function handlePatchSubscriber(request, env) {
  const body = await safeJson(request);
  const endpoint = body?.endpoint;
  const patch = body?.patch || {};

  if (!endpoint) return json({ error: "Missing endpoint" }, 400);

  const subKey = await subscriptionKey(endpoint);
  const record = await getSubscriptionRecord(env, subKey);
  if (!record) return json({ error: "Subscription not found" }, 404);

  const previous = structuredClone(record);

  if (patch.name !== undefined && patch.name !== null) record.name = patch.name;
  if (patch.language !== undefined && patch.language !== null) record.language = patch.language;
  if (patch.timezone !== undefined && patch.timezone !== null) record.timezone = patch.timezone;
  if (patch.lat !== undefined && patch.lat !== null) record.lat = patch.lat;
  if (patch.lon !== undefined && patch.lon !== null) record.lon = patch.lon;
  if (patch.settings !== undefined && patch.settings !== null) record.settings = sanitizeSettings(patch.settings);
  if (patch.customAttributes !== undefined && patch.customAttributes !== null) record.customAttributes = patch.customAttributes;

  const scheduleAffects =
    patch.language !== undefined ||
    patch.timezone !== undefined ||
    patch.lat !== undefined ||
    patch.lon !== undefined ||
    patch.settings !== undefined;

  if (scheduleAffects) {
    await removeScheduledBucketsForRecord(env, subKey, previous, 7);
    record.scheduleVersion = Date.now();
  }

  record.updatedAt = new Date().toISOString();
  await putSubscriptionRecord(env, subKey, record);

  if (scheduleAffects) {
    await buildInitialBuckets(env, subKey, record, 7);
  }

  return json({ ok: true, key: subKey, message: "Subscriber patched", record });
}
