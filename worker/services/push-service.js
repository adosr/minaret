import webpush from "web-push";

export function configureVapid(env) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

export async function sendPush(env, subscription, payload) {
  configureVapid(env);
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
