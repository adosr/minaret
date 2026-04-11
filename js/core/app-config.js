import { APP_CONFIG } from "../../packages/core/app-config.js";

export const WEB_APP_CONFIG = {
  ...APP_CONFIG,
  localePath: "./locales",
  serviceWorkerPath: "./service-worker.js"
};
