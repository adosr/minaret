import { json, safeJson } from "../utils/response.js";
import {
  listSubscriptionKeys,
  getSubscriptionRecord,
  resolveRecordsByEndpoints
} from "../services/subscription-service.js";
import { sendManualPushNow, scheduleManualPush } from "../services/bucket-service.js";
import { zonedLocalToUtcIso } from "../utils/time.js";

export async function handleManualPush(request, env) {
  const body = await safeJson(request);

  const mode = body?.mode || "now";
  const target = body?.target || "all";
  const endpoints = Array.isArray(body?.endpoints) ? body.endpoints : [];
  const language = body?.language || "ar";
  const timezone = body?.timezone || "UTC";
  const title = body?.title || (language === "ar" ? "إشعار يدوي" : "Manual Push");
  const bodyText = body?.body || "";
  const scheduleAtLocal = body?.scheduleAtLocal || null;
  const extraOptions = body?.extraOptions || {};

  const payload = {
    title,
    options: {
      body: bodyText,
      tag: extraOptions?.tag || `manual-${Date.now()}`,
      renotify: false,
      ...extraOptions
    }
  };

  const records = await getTargetRecords(env, target, endpoints);

  console.log("Manual push request received", {
    mode,
    target,
    endpointsCount: endpoints.length,
    resolvedRecords: records.length,
    timezone
  });

  if (mode === "now") {
    const result = await sendManualPushNow(env, records, payload);
    return json({
      ok: true,
      mode,
      target,
      ...result
    });
  }

  if (!scheduleAtLocal) {
    return json({ error: "scheduleAtLocal is required for scheduled mode" }, 400);
  }

  const dueAt = zonedLocalToUtcIso(scheduleAtLocal, timezone);
  const result = await scheduleManualPush(env, records, payload, dueAt);

  return json({
    ok: true,
    mode,
    target,
    dueAt,
    bucketKey: result.bucketKey,
    count: result.count,
    resolvedRecords: records.length
  });
}

async function getTargetRecords(env, target, endpoints) {
  if (target === "selected") {
    return resolveRecordsByEndpoints(env, endpoints);
  }

  const list = await listSubscriptionKeys(env);
  const records = [];

  for (const item of list.keys) {
    const record = await getSubscriptionRecord(env, item.name);
    if (record?.subscription?.endpoint) {
      records.push({ subKey: item.name, record });
    }
  }

  return records;
}
