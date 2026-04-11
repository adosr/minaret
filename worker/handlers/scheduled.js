import { runScheduledBucket } from "../services/bucket-service.js";

export async function handleScheduled(env) {
  await runScheduledBucket(env);
}
