import { bootstrapApp } from "./core/bootstrap.js";

bootstrapApp().catch((error) => {
  console.error("Bootstrap failed:", error);
  document.documentElement.classList.remove("preinit");
  document.body?.classList?.remove("preinit");
});
