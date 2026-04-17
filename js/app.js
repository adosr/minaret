import { bootstrapApp } from "./core/bootstrap.js";
import { initLiquidGlass } from "./liquid-glass.js";

function applyHashRoute() {
  const hash = window.location.hash.toLowerCase();

  if (!hash) return;

  if (hash === "#monthly") {
    document.getElementById("tabMonthly")?.click();
  } else if (hash === "#daily") {
    document.getElementById("tabDaily")?.click();
  }
}

bootstrapApp()
  .then(() => {
    if (window.location.hash) {
      applyHashRoute();
    }
    initLiquidGlass();
  })
  .catch((error) => {
    console.error("Bootstrap failed:", error);
    document.documentElement.classList.remove("preinit");
    document.body?.classList?.remove("preinit");
  });