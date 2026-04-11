import { json } from "./response.js";

export function requireAdminAuth(request, env) {
  if (!env.ADMIN_TOKEN) return null;
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (token && token === env.ADMIN_TOKEN) return null;
  return json({ ok: false, error: "Unauthorized" }, 401);
}
