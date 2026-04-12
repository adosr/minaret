import { WEB_APP_CONFIG } from "./core/app-config.js";
import {
  loadAdminToken,
  persistAdminToken,
  loadSavedLocation,
  loadSettings,
  loadNotificationPreferences,
  persistNotificationPreferences
} from "./utils/storage.js";
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
  enableAdminNotificationsBtn: document.getElementById("enableAdminNotificationsBtn"),
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
let currentPermissionState = "unsupported";
let activationInFlight = false;

init().catch((error) => {
  console.error(error);
  setFeedback(COPY.initFailed(error?.message || String(error)), true);
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
  els.enableAdminNotificationsBtn?.addEventListener("click", enableNotificationsForAdminContext);

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
  els.enableAdminNotificationsBtn.textContent = COPY.enableHere;
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
  await navigator.serviceWorker.register("../service-worker.js", { updateViaCache: "none" });
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

  currentPermissionState = permissionState;
  currentSubscription = subscription;
  summaryState = summary;

  renderPermission(permissionState);
  renderSubscription(subscription);
  renderSummary(summary);
  updateHeroState(permissionState, subscription, summary);
  updateActionStates();

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

function updateActionStates() {
  const hasSubscription = Boolean(currentSubscription?.endpoint);
  const canActivate = !activationInFlight && currentPermissionState !== "unsupported" && currentPermissionState !== "denied" && !hasSubscription;
  els.enableAdminNotificationsBtn.hidden = hasSubscription;
  els.enableAdminNotificationsBtn.disabled = !canActivate;
  els.sendTestPushBtn.disabled = !hasSubscription || activationInFlight;

  if (currentPermissionState === "denied") {
    els.enableAdminNotificationsBtn.hidden = false;
    els.enableAdminNotificationsBtn.disabled = false;
    els.enableAdminNotificationsBtn.textContent = COPY.openSettings;
    return;
  }

  els.enableAdminNotificationsBtn.textContent = currentPermissionState === "default"
    ? COPY.allowHere
    : COPY.enableHere;
}

async function enableNotificationsForAdminContext() {
  try {
    if (currentPermissionState === "denied") {
      window.alert(COPY.settingsHelp);
      return;
    }

    activationInFlight = true;
    updateActionStates();
    setFeedback(COPY.activating);

    const location = loadSavedLocation();
    if (!location?.lat || !location?.lon) {
      throw new Error(COPY.locationRequired);
    }

    if (currentPermissionState !== "granted") {
      const permission = await Notification.requestPermission();
      currentPermissionState = permission;
      if (permission !== "granted") {
        throw new Error(COPY.permissionNotGranted);
      }
    }

    const registration = await navigator.serviceWorker.ready;
    const vapidPublicKey = await fetch(`${WORKER_BASE_URL}/notifications/public-key`).then(assertTextResponse);

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
    }

    const prefs = normalizePrefs(loadNotificationPreferences());
    prefs.enabled = true;
    persistNotificationPreferences(prefs);

    const response = await fetch(`${WORKER_BASE_URL}/notifications/subscription`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        lat: location.lat,
        lon: location.lon,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        name: getPreferredLocationName(location),
        settings: loadSettings(),
        language: (document.documentElement.lang || "en").startsWith("ar") ? "ar" : "en",
        userAgent: navigator.userAgent,
        notificationPrefs: prefs
      })
    });

    const json = await assertJsonResponse(response);
    if (!json?.ok) {
      throw new Error(json?.error || COPY.activationFailedGeneric);
    }

    setFeedback(COPY.activated(fingerprintEndpoint(subscription.endpoint)));
    await refreshDiagnostics(false);
  } catch (error) {
    console.error(error);
    setFeedback(COPY.activationFailed(error?.message || String(error)), true);
  } finally {
    activationInFlight = false;
    updateActionStates();
  }
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

function getPreferredLocationName(location) {
  return ((document.documentElement.lang || "en").startsWith("ar") ? location.nameAr : location.nameEn) || location.nameAr || location.nameEn || null;
}

function normalizePrefs(value) {
  return {
    enabled: value?.enabled === true,
    prayers: {
      fajr: value?.prayers?.fajr !== false,
      dhuhr: value?.prayers?.dhuhr !== false,
      asr: value?.prayers?.asr !== false,
      maghrib: value?.prayers?.maghrib !== false,
      isha: value?.prayers?.isha !== false
    }
  };
}

function assertTextResponse(response) {
  return response.text().then((text) => {
    if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
    return text;
  });
}

async function assertJsonResponse(response) {
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || `HTTP ${response.status}`);
  }
  return json;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
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
      currentDeviceHint: "هذه الصفحة تختبر اشتراك هذا السياق الحالي فقط.",
      workerLabel: "الووركر",
      sectionTitle: "اختبار الإشعارات",
      permissionLabel: "إذن إشعارات iPhone",
      subscriptionLabel: "اشتراك هذا الجهاز",
      endpointLabel: "بصمة الـ endpoint",
      summaryLabel: "ملخص الووركر",
      actionsTitle: "الإجراءات",
      enableHere: "تفعيل إشعارات هذا الجهاز للإدارة",
      allowHere: "السماح بإشعارات iPhone هنا",
      openSettings: "طريقة التفعيل من إعدادات iPhone",
      sendTestPush: "إرسال إشعار تجريبي لهذا الجهاز",
      refresh: "تحديث التشخيص",
      resultLabel: "النتيجة",
      tabLabel: "الإشعارات",
      adminTokenPrompt: "أدخل Admin token",
      refreshing: "جارٍ تحديث التشخيص...",
      activating: "جارٍ تفعيل إشعارات هذا السياق...",
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
      heroNeedsSubscription: "الإذن موجود لكن لا يوجد اشتراك لهذا السياق",
      heroReady: "هذا الجهاز جاهز لاختبار الإشعارات",
      heroPartial: "الاشتراك موجود لكن فحص الووركر يحتاج مراجعة",
      activated: (fingerprint) => `تم تفعيل اشتراك هذا السياق: ${fingerprint}`,
      activationFailed: (error) => `فشل تفعيل إشعارات هذا السياق: ${error}`,
      activationFailedGeneric: "تعذر إنشاء الاشتراك الجديد.",
      permissionNotGranted: "لم يتم منح الإذن بعد.",
      locationRequired: "افتح التطبيق الرئيسي مرة واحدة وتأكد من السماح بالموقع، ثم ارجع إلى لوحة الإدارة.",
      settingsHelp: "لتفعيل إشعارات iPhone من جديد: افتح الإعدادات > الإشعارات > منارة، ثم فعّل السماح بالإشعارات وارجع إلى التطبيق.",
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
    currentDeviceHint: "This page tests the current context subscription only.",
    workerLabel: "Worker",
    sectionTitle: "Notification testing",
    permissionLabel: "iPhone notification permission",
    subscriptionLabel: "Current device subscription",
    endpointLabel: "Endpoint fingerprint",
    summaryLabel: "Worker summary",
    actionsTitle: "Actions",
    enableHere: "Enable notifications for this admin context",
    allowHere: "Allow iPhone notifications here",
    openSettings: "How to enable in iPhone settings",
    sendTestPush: "Send test notification to this device",
    refresh: "Refresh diagnostics",
    resultLabel: "Result",
    tabLabel: "Notifications",
    adminTokenPrompt: "Enter admin token",
    refreshing: "Refreshing diagnostics…",
    activating: "Activating notifications for this context…",
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
    heroNeedsSubscription: "Permission is granted, but this context has no subscription",
    heroReady: "This device is ready for notification testing",
    heroPartial: "Subscription exists, but the worker still needs review",
    activated: (fingerprint) => `This context is now subscribed: ${fingerprint}`,
    activationFailed: (error) => `Failed to activate this context: ${error}`,
    activationFailedGeneric: "Could not create a new subscription.",
    permissionNotGranted: "Permission was not granted.",
    locationRequired: "Open the main app once, allow location access there, then return to the admin page.",
    settingsHelp: "To turn iPhone notifications back on: open Settings > Notifications > Minaret, allow notifications, then return to the app.",
    sent: (fingerprint) => `Test notification sent to this device only: ${fingerprint}`,
    sendFailed: (error) => `Failed to send the test notification: ${error}`,
    initFailed: (error) => `Failed to initialize the admin page: ${error}`,
    noSubscriptionForTest: "There is no active subscription for this device.",
    unauthorized: "Admin token is missing or invalid.",
    lastRefresh: (time) => `Last refresh: ${time}`,
    unknownError: "Unknown error"
  };
}
