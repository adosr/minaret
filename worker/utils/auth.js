import { json } from "./response.js";

export function requireAdminAuth(request, env) {
  const expectedToken = typeof env.ADMIN_TOKEN === "string" ? env.ADMIN_TOKEN.trim() : "";
  if (!expectedToken) {
    return json({ ok: false, error: "ADMIN_TOKEN is not configured on the worker." }, 500);
  }

  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const providedToken = match?.[1]?.trim() || "";

  if (!providedToken || providedToken !== expectedToken) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  return null;
}
