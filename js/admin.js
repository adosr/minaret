import { WEB_APP_CONFIG } from "./core/app-config.js";
import { loadAdminToken, persistAdminToken } from "./utils/storage.js";
import { initBottomTabs } from "./components/bottom-tabs.js";

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

let adminToken = loadAdminToken();
let currentSubscription = null;
let summaryState = null;

init().catch((error) => {
  console.error(error);
  setFeedback(COPY.errors.initFailed(error?.message || String(error)), true);
});

async function init() {
  applyCopy();
  initBottomTabs({
    tabBar: els.tabBar,
    activePill: els.tabActivePill,
    onSelectPage: () => {}
  });

  maybeLoadToken();
  els.workerHostValue.textContent = simplifyWorkerUrl(WORKER_BASE_URL);
  els.refreshAdminBtn?.addEventListener("click", () => refreshDiagnostics(true));
  els.sendTestPushBtn?.addEventListener("click", sendTestPush);

  await ensureServiceWorkerReady();
  await refreshDiagnostics(false);
  document.documentElement.classList.remove("preinit");
}

function applyCopy() {
  document.title = COPY.documentTitle;
  els.adminLocationLabel.textContent = COPY.kicker;
  els.adminTitle.textContent = COPY.title;
  els.heroStatusLabel.textContent = COPY.currentDeviceLabel;
  els.heroStatusHint.textContent = COPY.currentDeviceHint;
  els.workerHostLabel.textContent = COPY.workerLabel;
  els.adminSectionHeader.textContent = COPY.sectionTitle;
  els.permissionLabel.textContent = COPY.permissionLabel;
  els.subscriptionLabel.textContent = COPY.subscriptionLabel;
  els.endpointLabel.textContent = COPY.endpointLabel;
  els.summaryLabel.textContent = COPY.summaryLabel;
  els.actionsHeader.textContent = COPY.actionsTitle;
  els.sendTestPushBtn.textContent = COPY.sendTestPush;
  els.refreshAdminBtn.textContent = COPY.refresh;
  els.feedbackLabel.textContent = COPY.resultLabel;
  els.tabAdminLabel.textContent = COPY.tabLabel;
  els.tabAdminLabelAccent.textContent = COPY.tabLabel;
  els.adminDateLabel.textContent = formatNow();
}

function maybeLoadToken() {
  if (adminToken) return;
  const token = window.prompt(COPY.adminTokenPrompt, "");
  if (token) {
    adminToken = token.trim();
    persistAdminToken(adminToken);
  }
}

async function ensureServiceWorkerReady() {
  if (!("serviceWorker" in navigator)) return;
  await navigator.serviceWorker.register("../service-worker.js");
  await navigator.serviceWorker.ready;
}

async function refreshDiagnostics(showFeedback = true) {
  if (showFeedback) {
    setFeedback(COPY.refreshing);
  }

  els.adminDateLabel.textContent = formatNow();
  els.lastRefreshValue.textContent = COPY.lastRefresh(formatTime());

  const [permissionState, subscription, summary] = await Promise.all([
    getPermissionState(),
    getCurrentSubscription(),
    fetchSummary()
  ]);

  currentSubscription = subscription;
  summaryState = summary;

  renderPermission(permissionState);
  renderSubscription(subscription);
  renderSummary(summary);
  updateHeroState(permissionState, subscription, summary);

  if (showFeedback) {
    setFeedback(COPY.readyState);
  }
}

async function getPermissionState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

async function getCurrentSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function fetchSummary() {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/admin/summary`, {
      headers: buildHeaders()
    });

    if (response.status === 401) {
      persistAdminToken("");
      adminToken = "";
      throw new Error(COPY.unauthorized);
    }

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error || `HTTP ${response.status}`);
    }

    return json;
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error)
    };
  }
}

function renderPermission(permissionState) {
  if (permissionState === "granted") {
    els.permissionValue.textContent = COPY.permissionGranted;
    return;
  }

  if (permissionState === "denied") {
    els.permissionValue.textContent = COPY.permissionDenied;
    return;
  }

  if (permissionState === "default") {
    els.permissionValue.textContent = COPY.permissionDefault;
    return;
  }

  els.permissionValue.textContent = COPY.permissionUnsupported;
}

function renderSubscription(subscription) {
  const hasSubscription = Boolean(subscription?.endpoint);
  els.subscriptionValue.textContent = hasSubscription
    ? COPY.subscriptionFound
    : COPY.subscriptionMissing;
  els.endpointValue.textContent = hasSubscription
    ? fingerprintEndpoint(subscription.endpoint)
    : COPY.noEndpoint;
  els.sendTestPushBtn.disabled = !hasSubscription;
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

function updateHeroState(permissionState, subscription, summary) {
  if (permissionState !== "granted") {
    els.heroStatusValue.textContent = COPY.heroNeedsPermission;
    return;
  }

  if (!subscription?.endpoint) {
    els.heroStatusValue.textContent = COPY.heroNeedsSubscription;
    return;
  }

  if (summary?.ok) {
    els.heroStatusValue.textContent = COPY.heroReady;
    return;
  }

  els.heroStatusValue.textContent = COPY.heroPartial;
}

async function sendTestPush() {
  try {
    setFeedback(COPY.sending);

    if (!currentSubscription?.endpoint) {
      throw new Error(COPY.noSubscriptionForTest);
    }

    const response = await fetch(`${WORKER_BASE_URL}/admin/test-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildHeaders()
      },
      body: JSON.stringify({
        endpoint: currentSubscription.endpoint
      })
    });

    if (response.status === 401) {
      persistAdminToken("");
      adminToken = "";
      throw new Error(COPY.unauthorized);
    }

    const json = await response.json();

    if (!response.ok || !json?.ok) {
      throw new Error(json?.error || `HTTP ${response.status}`);
    }

    setFeedback(COPY.sent(json?.endpoint_fingerprint || fingerprintEndpoint(currentSubscription.endpoint)));
    await refreshDiagnostics(false);
  } catch (error) {
    console.error(error);
    setFeedback(COPY.sendFailed(error?.message || String(error)), true);
  }
}

function setFeedback(message, isError = false) {
  els.feedbackValue.textContent = message;
  els.feedbackValue.classList.toggle("admin-feedback-error", isError);
}

function buildHeaders() {
  const headers = {};
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  return headers;
}

function fingerprintEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    const tail = url.pathname.split("/").filter(Boolean).pop() || "…";
    return `${url.host} • …${tail.slice(-20)}`;
  } catch {
    return endpoint.slice(-28);
  }
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

function getCopy() {
  const isArabic = (document.documentElement.lang || "en").startsWith("ar");

  if (isArabic) {
    return {
      documentTitle: "Minaret Admin",
      kicker: "لوحة منارة",
      title: "مختبر الإشعارات",
      currentDeviceLabel: "الجهاز الحالي",
      currentDeviceHint: "هذه الصفحة تختبر اشتراك هذا المتصفح فقط.",
      workerLabel: "الووركر",
      sectionTitle: "اختبار الإشعارات",
      permissionLabel: "إذن إشعارات iPhone",
      subscriptionLabel: "اشتراك هذا الجهاز",
      endpointLabel: "بصمة الـ endpoint",
      summaryLabel: "ملخص الووركر",
      actionsTitle: "الإجراءات",
      sendTestPush: "إرسال إشعار تجريبي لهذا الجهاز",
      refresh: "تحديث التشخيص",
      resultLabel: "النتيجة",
      tabLabel: "الإشعارات",
      adminTokenPrompt: "أدخل Admin token",
      refreshing: "جارٍ تحديث التشخيص...",
      sending: "جارٍ إرسال الإشعار التجريبي...",
      readyState: "تم تحديث التشخيص.",
      permissionGranted: "مفعّل ومسموح من النظام.",
      permissionDenied: "مغلق من إعدادات النظام.",
      permissionDefault: "لم يتم منح الإذن بعد.",
      permissionUnsupported: "هذا المتصفح لا يدعم Web Push.",
      subscriptionFound: "يوجد اشتراك نشط مرتبط بهذا الجهاز.",
      subscriptionMissing: "لا يوجد اشتراك حالي لهذا الجهاز.",
      noEndpoint: "لا يوجد endpoint متاح الآن.",
      summaryUnavailable: (error) => `تعذر قراءة الملخص: ${error}`,
      summaryTemplate: ({ subscriptions, enabled, disabled }) => `إجمالي الاشتراكات: ${subscriptions} • المفعّل: ${enabled} • المعطّل: ${disabled}`,
      heroNeedsPermission: "الإذن غير مكتمل بعد",
      heroNeedsSubscription: "الإذن موجود لكن لا يوجد اشتراك لهذا الجهاز",
      heroReady: "هذا الجهاز جاهز لاختبار الإشعارات",
      heroPartial: "الاشتراك موجود لكن فحص الووركر يحتاج مراجعة",
      sent: (fingerprint) => `تم إرسال الإشعار التجريبي إلى هذا الجهاز فقط: ${fingerprint}`,
      sendFailed: (error) => `فشل إرسال الإشعار التجريبي: ${error}`,
      initFailed: (error) => `تعذر تهيئة صفحة الإدارة: ${error}`,
      noSubscriptionForTest: "لا يوجد اشتراك نشط لهذا الجهاز لإرسال الاختبار إليه.",
      unauthorized: "رمز الإدارة غير صحيح أو مفقود.",
      lastRefresh: (time) => `آخر تحديث: ${time}`,
      unknownError: "خطأ غير معروف"
    };
  }

  return {
    documentTitle: "Minaret Admin",
    kicker: "Minaret Admin",
    title: "Notification Lab",
    currentDeviceLabel: "Current device",
    currentDeviceHint: "This page tests the current browser subscription only.",
    workerLabel: "Worker",
    sectionTitle: "Notification testing",
    permissionLabel: "iPhone notification permission",
    subscriptionLabel: "Current device subscription",
    endpointLabel: "Endpoint fingerprint",
    summaryLabel: "Worker summary",
    actionsTitle: "Actions",
    sendTestPush: "Send test notification to this device",
    refresh: "Refresh diagnostics",
    resultLabel: "Result",
    tabLabel: "Notifications",
    adminTokenPrompt: "Enter admin token",
    refreshing: "Refreshing diagnostics…",
    sending: "Sending test notification…",
    readyState: "Diagnostics refreshed.",
    permissionGranted: "Granted and available.",
    permissionDenied: "Turned off in system settings.",
    permissionDefault: "Permission has not been granted yet.",
    permissionUnsupported: "This browser does not support Web Push.",
    subscriptionFound: "An active subscription exists for this device.",
    subscriptionMissing: "No active subscription exists for this device.",
    noEndpoint: "No endpoint available right now.",
    summaryUnavailable: (error) => `Summary unavailable: ${error}`,
    summaryTemplate: ({ subscriptions, enabled, disabled }) => `Subscriptions: ${subscriptions} • Enabled: ${enabled} • Disabled: ${disabled}`,
    heroNeedsPermission: "Permission is not fully available yet",
    heroNeedsSubscription: "Permission is granted, but this device has no subscription",
    heroReady: "This device is ready for notification testing",
    heroPartial: "Subscription exists, but the worker still needs review",
    sent: (fingerprint) => `Test notification sent to this device only: ${fingerprint}`,
    sendFailed: (error) => `Failed to send the test notification: ${error}`,
    initFailed: (error) => `Failed to initialize the admin page: ${error}`,
    noSubscriptionForTest: "There is no active subscription for this device.",
    unauthorized: "Admin token is missing or invalid.",
    lastRefresh: (time) => `Last refresh: ${time}`,
    unknownError: "Unknown error"
  };
}
