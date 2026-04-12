import { json } from "../utils/response.js";
import { listSubscriptionKeys, getSubscriptionRecord } from "../services/subscription-service.js";
import { sendPush } from "../services/push-service.js";

function fingerprintEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpoint) return null;
  return `${endpoint.slice(0, 24)}…${endpoint.slice(-16)}`;
}

function getRecordTimestamp(record) {
  const candidate = record?.updatedAt || record?.createdAt || null;
  if (!candidate) return 0;
  const value = Date.parse(candidate);
  return Number.isFinite(value) ? value : 0;
}

async function loadSubscriptionStats(env) {
  const list = await listSubscriptionKeys(env);

  let enabled = 0;
  let disabled = 0;
  let latestRecord = null;
  let latestTimestamp = 0;

  for (const item of list.keys) {
    const record = await getSubscriptionRecord(env, item.name);
    if (!record?.subscription?.endpoint) continue;

    if (record?.notificationPrefs?.enabled) enabled += 1;
    else disabled += 1;

    const timestamp = getRecordTimestamp(record);
    if (!latestRecord || timestamp >= latestTimestamp) {
      latestRecord = record;
      latestTimestamp = timestamp;
    }
  }

  return {
    total: list.keys.length,
    enabled,
    disabled,
    complete: list.list_complete,
    latestRecord,
    latestTimestamp
  };
}

export async function handleSummary(env) {
  const stats = await loadSubscriptionStats(env);
  const latest = stats.latestRecord;

  return json({
    ok: true,
    subscriptions: stats.total,
    enabled: stats.enabled,
    disabled: stats.disabled,
    subscriptions_complete: stats.complete,
    now_utc: new Date().toISOString(),
    latest_subscription: latest
      ? {
          endpoint_fingerprint: fingerprintEndpoint(latest.subscription?.endpoint),
          updated_at: latest.updatedAt || latest.createdAt || null,
          location_name: latest.name || null,
          language: latest.language || null,
          notifications_enabled: latest.notificationPrefs?.enabled === true
        }
      : null
  });
}

export async function handleTestPush(env) {
  const stats = await loadSubscriptionStats(env);
  const latest = stats.latestRecord;

  if (!latest?.subscription) {
    return json({ ok: false, error: "No saved subscriptions were found." }, 404);
  }

  await sendPush(env, latest.subscription, {
    type: "test",
    prayer: "test",
    title: latest.language === "ar" ? "اختبار من منارة 🔔" : "Minaret test 🔔",
    body: latest.language === "ar"
      ? "هذا إشعار تجريبي تم إرساله إلى آخر مشترك محفوظ."
      : "This is a test notification sent to the latest saved subscriber.",
    sent_at: new Date().toISOString()
  });

  return json({
    ok: true,
    endpoint_fingerprint: fingerprintEndpoint(latest.subscription.endpoint),
    sent_to_latest: true,
    updated_at: latest.updatedAt || latest.createdAt || null
  });
}
