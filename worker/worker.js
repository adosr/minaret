import { routeRequest } from "./router/index.js";
import { handleScheduled } from "./handlers/scheduled.js";

export default {
  async fetch(request, env, ctx) {
    return routeRequest(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env, ctx));
  }
};
