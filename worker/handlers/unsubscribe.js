import { json, safeJson } from "../utils/response.js";
import { subscriptionKey, getSubscriptionRecord, deleteSubscriptionRecord } from "../services/subscription-service.js";
import { removeScheduledBucketsForRecord } from "../services/bucket-service.js";

export async function handleUnsubscribe(request, env) {
  const body = await safeJson(request);
  const endpoint = body?.endpoint;

  if (!endpoint) return json({ error: "Missing endpoint" }, 400);

  const subKey = await subscriptionKey(endpoint);
  const record = await getSubscriptionRecord(env, subKey);

  if (record) {
    await removeScheduledBucketsForRecord(env, subKey, record, 7);
  }

  await deleteSubscriptionRecord(env, subKey);

  return json({ ok: true, key: subKey, message: "Subscription deleted" });
}
