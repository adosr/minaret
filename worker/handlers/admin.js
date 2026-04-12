import { json } from "../utils/response.js";
import { listSubscriptionKeys, getSubscriptionRecord } from "../services/subscription-service.js";

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
