import { runNotificationSchedule } from "../services/notification-service.js";

export async function handleScheduled(_event, env) {
  await runNotificationSchedule(env);
}
