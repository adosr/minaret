import { WEB_APP_CONFIG } from "./core/app-config.js";
import { loadAdminToken, persistAdminToken } from "./utils/storage.js";

const WORKER_BASE_URL = WEB_APP_CONFIG.workerBaseUrl;

const els = {
  refreshSummaryBtn: document.getElementById("refreshSummaryBtn"),
  summaryBox: document.getElementById("summaryBox"),
  summaryFeedback: document.getElementById("summaryFeedback"),

  pushMode: document.getElementById("pushMode"),
  pushLanguage: document.getElementById("pushLanguage"),
  pushTimezone: document.getElementById("pushTimezone"),
  pushTargetMode: document.getElementById("pushTargetMode"),
  pushScheduleAt: document.getElementById("pushScheduleAt"),
  scheduleWrap: document.getElementById("scheduleWrap"),

  pushTitle: document.getElementById("pushTitle"),
  pushBody: document.getElementById("pushBody"),
  pushExtraJson: document.getElementById("pushExtraJson"),

  sendManualPushBtn: document.getElementById("sendManualPushBtn"),
  pushFeedback: document.getElementById("pushFeedback"),
  pushHint: document.getElementById("pushHint"),

  refreshSubscribersBtn: document.getElementById("refreshSubscribersBtn"),
  subscribersBox: document.getElementById("subscribersBox"),
  subscribersSection: document.getElementById("subscribersSection"),

  resultBox: document.getElementById("resultBox"),

  workerUrlValue: document.getElementById("workerUrlValue"),

  kpiSubscriptions: document.getElementById("kpiSubscriptions"),
  kpiBuckets: document.getElementById("kpiBuckets"),
  kpiNowUtc: document.getElementById("kpiNowUtc"),
  kpiLastRefresh: document.getElementById("kpiLastRefresh"),

  badgeConnectionDot: document.getElementById("badgeConnectionDot"),
  badgeConnectionText: document.getElementById("badgeConnectionText"),

  badgeSubscriptionsDot: document.getElementById("badgeSubscriptionsDot"),
  badgeSubscriptionsText: document.getElementById("badgeSubscriptionsText"),

  badgeBucketsDot: document.getElementById("badgeBucketsDot"),
  badgeBucketsText: document.getElementById("badgeBucketsText")
};

let subscribers = [];
let adminToken = loadAdminToken();

init();

async function init() {
  maybeLoadToken();

  if (els.workerUrlValue) {
    els.workerUrlValue.textContent = simplifyWorkerUrl(WORKER_BASE_URL);
  }

  if (els.pushTimezone) {
    els.pushTimezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  if (els.pushScheduleAt) {
    const now = new Date(Date.now() + 5 * 60 * 1000);
    now.setSeconds(0, 0);
    els.pushScheduleAt.value = toDateTimeLocal(now);
  }

  if (els.pushTitle) {
    els.pushTitle.value = "اختبار إشعار يدوي";
  }

  if (els.pushBody) {
    els.pushBody.value = "هذه رسالة اختبار من لوحة الإدارة.";
  }

  els.refreshSummaryBtn?.addEventListener("click", () => refreshSummary(true));
  els.refreshSubscribersBtn?.addEventListener("click", refreshSubscribers);
  els.sendManualPushBtn?.addEventListener("click", sendManualPush);
  els.pushMode?.addEventListener("change", updateVisibility);
  els.pushTargetMode?.addEventListener("change", updateVisibility);

  updateVisibility();
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

function buildHeaders(contentType = null) {
  const headers = {};
  if (contentType) headers["Content-Type"] = contentType;
  if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
  return headers;
}

function updateVisibility() {
  const isSchedule = els.pushMode?.value === "schedule";
  const isSelectedTarget = els.pushTargetMode?.value === "selected";

  els.scheduleWrap?.classList.toggle("hidden", !isSchedule);
  els.subscribersSection?.classList.toggle("hidden", !isSelectedTarget);

  if (els.pushHint) {
    els.pushHint.textContent = isSelectedTarget
      ? "Selected targeting requires loading subscribers, then choosing one or more devices."
      : "All-subscribers targeting does not require loading the subscriber list.";
  }
}

function setFeedback(element, message = "", type = "") {
  if (!element) return;
  element.textContent = message;
  element.className = type ? `admin-feedback ${type}` : "admin-feedback";
}

function setResult(data) {
  els.resultBox.textContent =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
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
      typeof json?.buckets === "number" ? String(json.buckets) : "--";
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
    `Subscriptions completeness: ${json?.subscriptions_complete ? "complete" : "partial"}`,
    json?.subscriptions_complete ? "success" : "warning"
  );

  setBadge(
    els.badgeBucketsDot,
    els.badgeBucketsText,
    `Buckets completeness: ${json?.buckets_complete ? "complete" : "partial"}`,
    json?.buckets_complete ? "success" : "warning"
  );

  els.summaryBox.textContent = JSON.stringify(json, null, 2);
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
    els.summaryBox.textContent = JSON.stringify(
      { ok: false, error: String(error?.message || error) },
      null,
      2
    );

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

async function refreshSubscribers() {
  setFeedback(els.pushFeedback, "Loading subscribers…", "info");

  try {
    const res = await fetch(`${WORKER_BASE_URL}/admin/subscribers`, {
      headers: buildHeaders()
    });

    const json = await res.json();

    if (!json.ok) {
      throw new Error(json.error || "Failed to load subscribers.");
    }

    subscribers = json.subscribers || [];
    renderSubscribers();

    setFeedback(
      els.pushFeedback,
      subscribers.length
        ? `Loaded ${subscribers.length} subscriber(s).`
        : "No subscribers found.",
      subscribers.length ? "ok" : "info"
    );
  } catch (error) {
    els.subscribersBox.textContent = `Failed to load subscribers: ${String(error?.message || error)}`;
    setFeedback(els.pushFeedback, "Failed to load subscribers.", "error");
  }
}

function renderSubscribers() {
  if (!subscribers.length) {
    els.subscribersBox.textContent = "No subscribers loaded.";
    return;
  }

  els.subscribersBox.innerHTML = subscribers
    .map((sub) => {
      const title =
        sub.name ||
        sub.customAttributes?.deviceLabel ||
        shortUserAgent(sub.userAgent) ||
        "Subscriber";

      return `
        <label class="subscriber-item">
          <div class="subscriber-item-head">
            <input
              type="checkbox"
              class="subscriber-check"
              data-endpoint="${encodeURIComponent(sub.endpoint)}"
            />
            <div>
              <div class="subscriber-title">${escapeHtml(title)}</div>
              <div class="subscriber-meta">
                Language: ${escapeHtml(sub.language || "-")}<br>
                Timezone: ${escapeHtml(sub.timezone || "-")}<br>
                Device: ${escapeHtml(shortUserAgent(sub.userAgent) || "-")}<br>
                Created: ${escapeHtml(sub.createdAt || "-")}<br>
                Last sent: ${escapeHtml(sub.lastSent?.sentAt || "-")}
              </div>
            </div>
          </div>
        </label>
      `;
    })
    .join("");
}

function getSelectedEndpoints() {
  return [...document.querySelectorAll(".subscriber-check:checked")]
    .map((el) => el.dataset.endpoint)
    .filter(Boolean)
    .map((value) => decodeURIComponent(value));
}

async function sendManualPush() {
  const targetMode = els.pushTargetMode?.value || "all";
  const selectedEndpoints = getSelectedEndpoints();

  if (targetMode === "selected" && selectedEndpoints.length === 0) {
    setFeedback(
      els.pushFeedback,
      "Select at least one subscriber before executing.",
      "error"
    );
    setResult({
      ok: false,
      error: "No selected subscribers."
    });
    return;
  }

  let extraOptions = {};
  try {
    extraOptions = parseJsonOrEmpty(els.pushExtraJson.value);
  } catch (error) {
    setFeedback(els.pushFeedback, String(error?.message || error), "error");
    setResult({
      ok: false,
      error: String(error?.message || error)
    });
    return;
  }

  const payload = {
    mode: els.pushMode.value,
    language: els.pushLanguage.value,
    timezone: els.pushTimezone.value.trim(),
    target: targetMode,
    endpoints: targetMode === "selected" ? selectedEndpoints : [],
    title: els.pushTitle.value.trim(),
    body: els.pushBody.value.trim(),
    scheduleAtLocal:
      els.pushMode.value === "schedule" ? els.pushScheduleAt.value || null : null,
    extraOptions
  };

  setFeedback(els.pushFeedback, "Executing push request…", "info");

  try {
    const res = await fetch(`${WORKER_BASE_URL}/admin/manual-push`, {
      method: "POST",
      headers: buildHeaders("application/json"),
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    setResult(json);

    if (json?.ok && Number(json.sent || 0) > 0 && Number(json.failed || 0) === 0) {
      setFeedback(
        els.pushFeedback,
        `Push completed successfully. Sent: ${json.sent}.`,
        "ok"
      );
    } else if (json?.ok && Number(json.failed || 0) > 0) {
      setFeedback(
        els.pushFeedback,
        `Push completed with failures. Sent: ${json.sent || 0}, Failed: ${json.failed || 0}.`,
        "error"
      );
    } else if (json?.ok) {
      setFeedback(
        els.pushFeedback,
        "Request completed, but nothing was sent.",
        "info"
      );
    } else {
      setFeedback(els.pushFeedback, "Push request failed.", "error");
    }

    els.resultBox.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    if (json?.ok) {
      refreshSummary(false);
      if (targetMode === "selected") {
        refreshSubscribers();
      }
    }
  } catch (error) {
    setResult({
      ok: false,
      error: String(error?.message || error)
    });

    setFeedback(els.pushFeedback, "Push request failed.", "error");

    els.resultBox.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function parseJsonOrEmpty(value) {
  if (!value.trim()) return {};

  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Invalid JSON in extra notification options.");
  }
}

function toDateTimeLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

function simplifyWorkerUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortUserAgent(ua) {
  if (!ua) return "";

  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("iPad")) return "iPad";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Macintosh")) return "Mac";

  return ua.length > 80 ? `${ua.slice(0, 80)}...` : ua;
}
