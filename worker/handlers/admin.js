import { json } from "../utils/response.js";
import { listSubscriptionKeys, getSubscriptionRecord, subscriptionKey } from "../services/subscription-service.js";
import { sendPush } from "../services/push-service.js";

export async function handleSummary(env) {
  const list = await listSubscriptionKeys(env);

  let enabled = 0;
  let disabled = 0;

  for (const item of list.keys) {
    const record = await getSubscriptionRecord(env, item.name);
    if (record?.notificationPrefs?.enabled) enabled += 1;
    else disabled += 1;
  }

  return json({
    ok: true,
    subscriptions: list.keys.length,
    enabled,
    disabled,
    subscriptions_complete: list.list_complete,
    now_utc: new Date().toISOString()
  });
}


export async function handleTestPush(request, env) {
  const body = await request.json().catch(() => ({}));
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";

  if (!endpoint) {
    return json({ ok: false, error: "Endpoint is required." }, 400);
  }

  const key = await subscriptionKey(endpoint);
  const record = await getSubscriptionRecord(env, key);

  if (!record?.subscription) {
    return json({ ok: false, error: "Subscription not found for this device." }, 404);
  }

  await sendPush(env, record.subscription, {
    type: "test",
    prayer: "test",
    title: record.language === "ar" ? "اختبار من منارة 🔔" : "Minaret test 🔔",
    body: record.language === "ar"
      ? "هذا إشعار تجريبي لهذا الجهاز فقط."
      : "This is a test notification for this device only.",
    sent_at: new Date().toISOString()
  });

  return json({
    ok: true,
    endpoint_fingerprint: `${endpoint.slice(0, 24)}…${endpoint.slice(-16)}`
  });
}
