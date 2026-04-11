import { corsHeaders, json } from "../utils/response.js";
import { requireAdminAuth } from "../utils/auth.js";
import { handleSubscribe } from "../handlers/subscribe.js";
import { handleUnsubscribe } from "../handlers/unsubscribe.js";
import { handleManualPush } from "../handlers/manual-push.js";
import { handleSummary, handleSubscribers, handlePatchSubscriber } from "../handlers/admin.js";
import { subscriptionKey, getSubscriptionRecord, listSubscriptionKeys } from "../services/subscription-service.js";
import { sendPush } from "../services/push-service.js";

export async function routeRequest(request, env, ctx) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (request.method === "GET" && url.pathname === "/vapid-public-key") {
    return new Response(env.VAPID_PUBLIC_KEY, {
      headers: { ...corsHeaders(), "content-type": "text/plain; charset=utf-8" }
    });
  }

  if (request.method === "POST" && url.pathname === "/subscribe") return handleSubscribe(request, env);
  if (request.method === "POST" && url.pathname === "/unsubscribe") return handleUnsubscribe(request, env);

  if (request.method === "GET" && url.pathname === "/subscriptions-count") {
    const list = await listSubscriptionKeys(env);
    return json({ ok: true, count: list.keys.length, complete: list.list_complete });
  }

  if (request.method === "POST" && url.pathname === "/test-push") {
    const body = await request.json();
    const endpoint = body?.endpoint;
    if (!endpoint) return json({ error: "Missing endpoint" }, 400);

    const subKey = await subscriptionKey(endpoint);
    const record = await getSubscriptionRecord(env, subKey);
    if (!record) return json({ error: "Subscription not found" }, 404);

    await sendPush(env, record.subscription, {
      title: "اختبار Web Push",
      options: {
        body: "إذا وصل هذا الإشعار والتطبيق مغلق فكل شيء ممتاز.",
        tag: "test-push",
        renotify: false
      }
    });

    return json({ ok: true, message: "Test push sent" });
  }

  if (url.pathname.startsWith("/admin/")) {
    const unauthorized = requireAdminAuth(request, env);
    if (unauthorized) return unauthorized;

    if (request.method === "GET" && url.pathname === "/admin/summary") return handleSummary(env);
    if (request.method === "GET" && url.pathname === "/admin/subscribers") return handleSubscribers(env);
    if (request.method === "POST" && url.pathname === "/admin/manual-push") return handleManualPush(request, env);
    if (request.method === "POST" && url.pathname === "/admin/patch-subscriber") return handlePatchSubscriber(request, env);
  }

  return json({ error: "Not found" }, 404);
}
