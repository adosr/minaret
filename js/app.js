import { bootstrapApp } from "./core/bootstrap.js";

bootstrapApp().catch((error) => {
  console.error("Bootstrap failed:", error);
  document.documentElement.classList.remove("preinit");
  document.body?.classList?.remove("preinit");
});

window.addEventListener('DOMContentLoaded', () => {
  const hash = window.location.hash.toLowerCase();

  if (hash === '#monthly') {
    document.getElementById('tabMonthly')?.click();
  } else if (hash === '#daily') {
    document.getElementById('tabDaily')?.click();
  }
});