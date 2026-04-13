import { WEB_APP_CONFIG } from "./core/app-config.js";
import { initBottomTabs } from "./components/bottom-tabs.js";
import { loadAdminToken, persistAdminToken } from "./utils/storage.js";

const WORKER_BASE_URL = WEB_APP_CONFIG.workerBaseUrl;
const COPY = getCopy();
const els = {
  adminLocationLabel: document.getElementById("adminLocationLabel"),
  adminTitle: document.getElementById("adminTitle"),
  adminDateLabel: document.getElementById("adminDateLabel"),
  heroStatusLabel: document.getElementById("heroStatusLabel"),
  heroStatusValue: document.getElementById("heroStatusValue"),
  heroStatusHint: document.getElementById("heroStatusHint"),
  workerHostLabel: document.getElementById("workerHostLabel"),
  workerHostValue: document.getElementById("workerHostValue"),
  lastRefreshValue: document.getElementById("lastRefreshValue"),
  adminSectionHeader: document.getElementById("adminSectionHeader"),
  permissionLabel: document.getElementById("permissionLabel"),
  permissionValue: document.getElementById("permissionValue"),
  subscriptionLabel: document.getElementById("subscriptionLabel"),
  subscriptionValue: document.getElementById("subscriptionValue"),
  endpointLabel: document.getElementById("endpointLabel"),
  endpointValue: document.getElementById("endpointValue"),
  summaryLabel: document.getElementById("summaryLabel"),
  summaryValue: document.getElementById("summaryValue"),
  adminAuthHeader: document.getElementById("adminAuthHeader"),
  adminTokenLabel: document.getElementById("adminTokenLabel"),
  adminTokenInput: document.getElementById("adminTokenInput"),
  adminTokenHintLabel: document.getElementById("adminTokenHintLabel"),
  adminTokenHint: document.getElementById("adminTokenHint"),
  actionsHeader: document.getElementById("actionsHeader"),
  sendTestPushBtn: document.getElementById("sendTestPushBtn"),
  refreshAdminBtn: document.getElementById("refreshAdminBtn"),
  feedbackLabel: document.getElementById("feedbackLabel"),
  feedbackValue: document.getElementById("feedbackValue"),
  tabBar: document.getElementById("tabBar"),
  tabActivePill: document.getElementById("tabActivePill"),
  tabAdminLabel: document.getElementById("tabAdminLabel"),
  tabAdminLabelAccent: document.getElementById("tabAdminLabelAccent")
};

let summaryState = null;
let actionInFlight = false;
let adminToken = "";

init().catch((error) => {
  console.error(error);
  setFeedback(COPY.initFailed(error?.message || String(error)), true);
  document.documentElement.classList.remove("preinit");
});

async function init() {
  applyCopy();
  initBottomTabs({
    tabBar: els.tabBar,
    activePill: els.tabActivePill,
    onSelectPage: () => {}
  });

  adminToken = loadAdminToken().trim();
  if (els.adminTokenInput) {
    els.adminTokenInput.value = adminToken;
    els.adminTokenInput.addEventListener("input", handleAdminTokenInput);
    els.adminTokenInput.addEventListener("change", handleAdminTokenInput);
  }

  els.workerHostValue.textContent = simplifyWorkerUrl(WORKER_BASE_URL);
  els.refreshAdminBtn?.addEventListener("click", () => refreshDiagnostics(true));
  els.sendTestPushBtn?.addEventListener("click", sendTestPush);

  await refreshDiagnostics(false);
  document.documentElement.classList.remove("preinit");
}

function applyCopy() {
  document.title = COPY.documentTitle;
  els.adminLocationLabel.textContent = COPY.kicker;
  els.adminTitle.textContent = COPY.title;
  els.heroStatusLabel.textContent = COPY.heroLabel;
  els.heroStatusHint.textContent = COPY.heroHint;
  els.workerHostLabel.textContent = COPY.workerLabel;
  els.adminSectionHeader.textContent = COPY.sectionTitle;
  els.permissionLabel.textContent = COPY.latestUpdatedLabel;
  els.subscriptionLabel.textContent = COPY.latestLocationLabel;
  els.endpointLabel.textContent = COPY.endpointLabel;
  els.summaryLabel.textContent = COPY.summaryLabel;
  els.adminAuthHeader.textContent = COPY.authTitle;
  els.adminTokenLabel.textContent = COPY.adminTokenLabel;
  els.adminTokenHintLabel.textContent = COPY.authenticationLabel;
  els.adminTokenHint.textContent = COPY.adminTokenHint;
  els.adminTokenInput.placeholder = COPY.adminTokenPlaceholder;
  els.actionsHeader.textContent = COPY.actionsTitle;
  els.sendTestPushBtn.textContent = COPY.sendTestPush;
  els.refreshAdminBtn.textContent = COPY.refresh;
  els.feedbackLabel.textContent = COPY.resultLabel;
  els.tabAdminLabel.textContent = COPY.tabLabel;
  els.tabAdminLabelAccent.textContent = COPY.tabLabel;
  els.adminDateLabel.textContent = formatNow();
}

function handleAdminTokenInput(event) {
  adminToken = String(event?.target?.value || "").trim();
  persistAdminToken(adminToken);
  updateActionStates();
}

async function refreshDiagnostics(showFeedback = true) {
  if (showFeedback) setFeedback(COPY.refreshing);

  els.adminDateLabel.textContent = formatNow();
  els.lastRefreshValue.textContent = COPY.lastRefresh(formatTime());
  summaryState = await fetchSummary();

  renderLatest(summaryState);
  renderSummary(summaryState);
  updateHeroState(summaryState);
  updateActionStates();

  if (showFeedback) {
    setFeedback(summaryState?.ok ? COPY.readyState : COPY.summaryUnavailable(summaryState?.error || COPY.unknownError), !summaryState?.ok);
  }
}

async function fetchSummary() {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/admin/summary`, {
      headers: buildAdminHeaders()
    });

    const json = await safeReadJson(response);
    if (!response.ok) throw new Error(json?.error || `HTTP ${response.status}`);
    return json;
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function renderLatest(summary) {
  const latest = summary?.latest_subscription || null;
  els.permissionValue.textContent = latest?.updated_at
    ? formatDateTime(latest.updated_at)
    : COPY.none;
  els.subscriptionValue.textContent = latest?.location_name || COPY.none;
  els.endpointValue.textContent = latest?.endpoint_fingerprint || COPY.none;
}

function renderSummary(summary) {
  if (!summary?.ok) {
    els.summaryValue.textContent = COPY.summaryUnavailable(summary?.error || COPY.unknownError);
    return;
  }

  els.summaryValue.textContent = COPY.summaryTemplate({
    subscriptions: summary.subscriptions ?? 0,
    enabled: summary.enabled ?? 0,
    disabled: summary.disabled ?? 0
  });
}

function updateHeroState(summary) {
  if (!adminToken) {
    els.heroStatusValue.textContent = COPY.heroMissingToken;
    return;
  }

  if (!summary?.ok) {
    els.heroStatusValue.textContent = COPY.heroUnavailable;
    return;
  }

  if (!summary?.latest_subscription) {
    els.heroStatusValue.textContent = COPY.heroNoSubscribers;
    return;
  }

  els.heroStatusValue.textContent = COPY.heroReady;
}

function updateActionStates() {
  const hasLatest = Boolean(summaryState?.latest_subscription?.endpoint_fingerprint);
  els.sendTestPushBtn.disabled = !adminToken || !hasLatest || actionInFlight;
}

async function sendTestPush() {
  try {
    if (!adminToken) {
      throw new Error(COPY.adminTokenRequired);
    }

    if (!summaryState?.latest_subscription) {
      throw new Error(COPY.noSubscriptionForTest);
    }

    actionInFlight = true;
    updateActionStates();
    setFeedback(COPY.sending);

    const response = await fetch(`${WORKER_BASE_URL}/admin/test-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAdminHeaders()
      }
    });

    const json = await safeReadJson(response);
    if (!response.ok || !json?.ok) {
      throw new Error(json?.error || `HTTP ${response.status}`);
    }

    setFeedback(COPY.sent(json?.endpoint_fingerprint || summaryState.latest_subscription.endpoint_fingerprint));
    await refreshDiagnostics(false);
  } catch (error) {
    console.error(error);
    setFeedback(COPY.sendFailed(error?.message || String(error)), true);
  } finally {
    actionInFlight = false;
    updateActionStates();
  }
}

function buildAdminHeaders() {
  return adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function setFeedback(message, isError = false) {
  els.feedbackValue.textContent = message;
  els.feedbackValue.classList.toggle("admin-feedback-error", isError);
}

function simplifyWorkerUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatNow() {
  return new Date().toLocaleDateString(document.documentElement.lang || "en", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function formatTime() {
  return new Date().toLocaleTimeString(document.documentElement.lang || "en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(document.documentElement.lang || "en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getCopy() {
  const isArabic = (document.documentElement.lang || "en").startsWith("ar");

  if (isArabic) {
    return {
      documentTitle: "Minaret Admin",
      kicker: "لوحة منارة",
      title: "مختبر الإشعارات",
      heroLabel: "آخر مشترك محفوظ",
      heroHint: "زر الاختبار يرسل الآن إلى آخر مشترك محفوظ في الووركر فقط.",
      workerLabel: "الووركر",
      sectionTitle: "اختبار الإشعارات",
      latestUpdatedLabel: "آخر تحديث للاشتراك",
      latestLocationLabel: "اسم الموقع",
      endpointLabel: "بصمة الـ endpoint",
      summaryLabel: "ملخص الووركر",
      authTitle: "وصول الإدارة",
      adminTokenLabel: "رمز إدارة الووركر",
      authenticationLabel: "المصادقة",
      adminTokenHint: "يُحفَظ هذا الرمز داخل هذا المتصفح فقط ويُرسل إلى الووركر كترويسة Bearer.",
      adminTokenPlaceholder: "أدخل رمز إدارة الووركر",
      actionsTitle: "الإجراءات",
      sendTestPush: "إرسال إشعار تجريبي لآخر مشترك",
      refresh: "تحديث التشخيص",
      resultLabel: "النتيجة",
      tabLabel: "الإشعارات",
      refreshing: "جارٍ تحديث التشخيص...",
      sending: "جارٍ إرسال الإشعار التجريبي...",
      readyState: "تم تحديث التشخيص.",
      summaryUnavailable: (error) => `تعذر قراءة الملخص: ${error}`,
      summaryTemplate: ({ subscriptions, enabled, disabled }) => `إجمالي الاشتراكات: ${subscriptions} • المفعّل: ${enabled} • المعطّل: ${disabled}`,
      heroUnavailable: "تعذر قراءة حالة الووركر",
      heroMissingToken: "أدخل رمز الإدارة لقراءة حالة الووركر",
      heroNoSubscribers: "لا يوجد أي مشترك محفوظ حتى الآن",
      heroReady: "جاهز لإرسال اختبار إلى آخر مشترك",
      sent: (fingerprint) => `تم إرسال الإشعار التجريبي إلى آخر مشترك محفوظ: ${fingerprint}`,
      sendFailed: (error) => `فشل إرسال الإشعار التجريبي: ${error}`,
      initFailed: (error) => `تعذر تهيئة صفحة الإدارة: ${error}`,
      noSubscriptionForTest: "لا يوجد أي مشترك محفوظ لإرسال الاختبار إليه.",
      adminTokenRequired: "أدخل رمز الإدارة أولًا.",
      lastRefresh: (time) => `آخر تحديث: ${time}`,
      unknownError: "خطأ غير معروف",
      none: "—"
    };
  }

  return {
    documentTitle: "Minaret Admin",
    kicker: "Minaret Admin",
    title: "Notification Lab",
    heroLabel: "Latest saved subscriber",
    heroHint: "The test button now sends only to the latest saved subscriber in the worker.",
    workerLabel: "Worker",
    sectionTitle: "Notification testing",
    latestUpdatedLabel: "Latest subscription update",
    latestLocationLabel: "Location name",
    endpointLabel: "Endpoint fingerprint",
    summaryLabel: "Worker summary",
    authTitle: "Admin access",
    adminTokenLabel: "Worker admin token",
    authenticationLabel: "Authentication",
    adminTokenHint: "Stored only in this browser and sent to the worker as a Bearer token.",
    adminTokenPlaceholder: "Enter worker admin token",
    actionsTitle: "Actions",
    sendTestPush: "Send test notification to latest subscriber",
    refresh: "Refresh diagnostics",
    resultLabel: "Result",
    tabLabel: "Notifications",
    refreshing: "Refreshing diagnostics…",
    sending: "Sending test notification…",
    readyState: "Diagnostics refreshed.",
    summaryUnavailable: (error) => `Summary unavailable: ${error}`,
    summaryTemplate: ({ subscriptions, enabled, disabled }) => `Subscriptions: ${subscriptions} • Enabled: ${enabled} • Disabled: ${disabled}`,
    heroUnavailable: "Worker status is unavailable",
    heroMissingToken: "Enter the admin token to read worker status",
    heroNoSubscribers: "No saved subscriber exists yet",
    heroReady: "Ready to send a test to the latest subscriber",
    sent: (fingerprint) => `Test notification sent to the latest saved subscriber: ${fingerprint}`,
    sendFailed: (error) => `Failed to send the test notification: ${error}`,
    initFailed: (error) => `Failed to initialize the admin page: ${error}`,
    noSubscriptionForTest: "No saved subscriber exists for testing.",
    adminTokenRequired: "Enter the admin token first.",
    lastRefresh: (time) => `Last refresh: ${time}`,
    unknownError: "Unknown error",
    none: "—"
  };
}
