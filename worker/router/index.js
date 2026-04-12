import { corsHeaders, json } from "../utils/response.js";
import { requireAdminAuth } from "../utils/auth.js";
import { handleSummary, handleTestPush } from "../handlers/admin.js";
import {
  handleUpsertNotificationSubscription,
  handleDeleteNotificationSubscription
} from "../handlers/notification-subscription.js";

export async function routeRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (request.method === "GET" && url.pathname === "/notifications/public-key") {
    return new Response(env.VAPID_PUBLIC_KEY, {
      headers: { ...corsHeaders(), "content-type": "text/plain; charset=utf-8" }
    });
  }

  if (request.method === "PUT" && url.pathname === "/notifications/subscription") {
    return handleUpsertNotificationSubscription(request, env);
  }

  if (request.method === "DELETE" && url.pathname === "/notifications/subscription") {
    return handleDeleteNotificationSubscription(request, env);
  }

  if (url.pathname.startsWith("/admin/")) {
    const unauthorized = requireAdminAuth(request, env);
    if (unauthorized) return unauthorized;

    if (request.method === "GET" && url.pathname === "/admin/summary") {
      return handleSummary(env);
    }

    if (request.method === "POST" && url.pathname === "/admin/test-push") {
      return handleTestPush(env);
    }
  }

  return json({ error: "Not found" }, 404);
}
