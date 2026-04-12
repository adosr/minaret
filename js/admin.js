import { WEB_APP_CONFIG } from "./core/app-config.js";
import { loadAdminToken, persistAdminToken } from "./utils/storage.js";

const WORKER_BASE_URL = WEB_APP_CONFIG.workerBaseUrl;

const els = {
  refreshSummaryBtn: document.getElementById("refreshSummaryBtn"),
  summaryBox: document.getElementById("summaryBox"),
  summaryFeedback: document.getElementById("summaryFeedback"),
  resultBox: document.getElementById("resultBox"),
  workerUrlValue: document.getElementById("workerUrlValue"),
  kpiSubscriptions: document.getElementById("kpiDevices"),
  kpiBuckets: document.getElementById("kpiEnabled"),
  kpiNowUtc: document.getElementById("kpiNowUtc"),
  kpiLastRefresh: document.getElementById("kpiLastRefresh"),
  badgeConnectionDot: document.getElementById("badgeConnectionDot"),
  badgeConnectionText: document.getElementById("badgeConnectionText"),
  badgeSubscriptionsDot: document.getElementById("badgeDevicesDot"),
  badgeSubscriptionsText: document.getElementById("badgeDevicesText"),
  badgeBucketsDot: document.getElementById("badgeEnabledDot"),
  badgeBucketsText: document.getElementById("badgeEnabledText")
};

let adminToken = loadAdminToken();

init();

async function init() {
  maybeLoadToken();

  if (els.workerUrlValue) {
    els.workerUrlValue.textContent = simplifyWorkerUrl(WORKER_BASE_URL);
  }

  els.refreshSummaryBtn?.addEventListener("click", () => refreshSummary(true));
  await refreshSummary(false);
}

function maybeLoadToken() {
  if (adminToken) return;

  const token = window.prompt("Admin token", "");
  if (token) {
    adminToken = token.trim();
    persistAdminToken(adminToken);
  }
}

function buildHeaders() {
  const headers = {};
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  return headers;
}

function setFeedback(element, message = "", type = "") {
  if (!element) return;
  element.textContent = message;
  element.className = type ? `admin-feedback ${type}` : "admin-feedback";
}

function setResult(data) {
  if (els.resultBox) {
    els.resultBox.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  }
}

function setBadge(dotEl, textEl, text, state = "info") {
  if (textEl) textEl.textContent = text;
  if (dotEl) dotEl.className = `admin-dot ${state}`;
}

function fillSummary(json) {
  if (els.kpiSubscriptions) {
    els.kpiSubscriptions.textContent =
      typeof json?.subscriptions === "number" ? String(json.subscriptions) : "--";
  }

  if (els.kpiBuckets) {
    els.kpiBuckets.textContent =
      typeof json?.enabled === "number" ? String(json.enabled) : "--";
  }

  if (els.kpiNowUtc) {
    els.kpiNowUtc.textContent = json?.now_utc || "--";
  }

  if (els.kpiLastRefresh) {
    els.kpiLastRefresh.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  setBadge(
    els.badgeConnectionDot,
    els.badgeConnectionText,
    json?.ok ? "Worker connection healthy" : "Worker connection issue",
    json?.ok ? "success" : "error"
  );

  setBadge(
    els.badgeSubscriptionsDot,
    els.badgeSubscriptionsText,
    `Devices completeness: ${json?.subscriptions_complete ? "complete" : "partial"}`,
    json?.subscriptions_complete ? "success" : "warning"
  );

  setBadge(
    els.badgeBucketsDot,
    els.badgeBucketsText,
    `Disabled devices: ${typeof json?.disabled === "number" ? json.disabled : "--"}`,
    typeof json?.disabled === "number" ? "info" : "warning"
  );

  if (els.summaryBox) {
    els.summaryBox.textContent = JSON.stringify(json, null, 2);
  }

  setResult(json);
}

async function refreshSummary(showFeedback = true) {
  if (showFeedback) {
    setFeedback(els.summaryFeedback, "Refreshing summary…", "info");
  }

  try {
    const res = await fetch(`${WORKER_BASE_URL}/admin/summary`, {
      headers: buildHeaders()
    });

    const json = await res.json();
    fillSummary(json);

    if (showFeedback) {
      setFeedback(els.summaryFeedback, "Summary updated successfully.", "ok");
    } else {
      setFeedback(els.summaryFeedback, "");
    }
  } catch (error) {
    const fallback = {
      ok: false,
      error: String(error?.message || error)
    };

    if (els.summaryBox) {
      els.summaryBox.textContent = JSON.stringify(fallback, null, 2);
    }

    setResult(fallback);

    setBadge(
      els.badgeConnectionDot,
      els.badgeConnectionText,
      "Worker connection issue",
      "error"
    );

    if (showFeedback) {
      setFeedback(els.summaryFeedback, "Failed to refresh summary.", "error");
    }
  }
}

function simplifyWorkerUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
