import { runNotificationDispatch, runScheduleMaintenance } from "../services/notification-service.js";

export async function handleScheduled(event, env) {
  const cron = event?.cron || "* * * * *";

  if (cron === "* * * * *") {
    return runNotificationDispatch(env);
  }

  return runScheduleMaintenance(env);
}
