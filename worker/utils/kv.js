export async function getJson(env, key, fallback = null) {
  const raw = await env.SUBSCRIPTIONS.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function putJson(env, key, value) {
  await env.SUBSCRIPTIONS.put(key, JSON.stringify(value));
}

export async function listKeys(env, prefix, limit = 1000) {
  return env.SUBSCRIPTIONS.list({ prefix, limit });
}
