import { prayerTimes } from "../../packages/shared/minaret-prayer-engine.js";
import { WEB_APP_CONFIG } from "./app-config.js";
import { appState } from "./app-state.js";
import { byId } from "../utils/dom.js";
import {
  loadSavedLocation,
  loadSettings,
  persistLocation,
  persistNotificationsEnabled,
  hasGeolocationBeenRequested,
  persistGeolocationRequested,
  wasGeolocationDenied,
  persistGeolocationDenied,
  clearGeolocationPermissionState
} from "../utils/storage.js";
import { getLocation, reverseGeocode, pickCityName, formatCoords, isGeolocationPermissionDenied } from "../utils/location.js";
import { detectLanguage, applyLanguageToDocument, loadTranslations } from "../utils/language.js";
import { formatDisplayDate } from "../utils/format.js";
import { initBottomTabs } from "../components/bottom-tabs.js";
import { createProgressDialController } from "../components/progress-dial.js";
import { renderMinaretDailyPage } from "../pages/minaret-daily-page.js";
import { renderMinaretMonthlyPage } from "../pages/minaret-monthly-page.js";
import { renderMinaretSettingsPage } from "../pages/minaret-settings-page.js";
import { disableSkeleton } from "../components/skeleton.js";

export async function bootstrapApp() {
  appState.settings = loadSettings();

  const lang = detectLanguage();
  applyLanguageToDocument(lang);

  const i18n = await loadTranslations(lang);
  appState.lang = i18n.language;
  appState.t = i18n.t;
  appState.dict = i18n.dict;

  cacheRefs();
  initTabs();
  initProgressDial();
  await registerSW();
  bindEvents();
  await hydrateLocation();

  if (appState.coords) {
    renderApp();
  } else {
    renderLocationError();
  }

  disableSkeleton();
}

function cacheRefs() {
  appState.refs = {
    location: byId("location"),
    title: byId("title"),
    todayLabel: byId("todayLabel"),
    currentPrayerLabel: byId("currentPrayerLabel"),
    currentPrayer: byId("currentPrayer"),
    currentPrayerHint: byId("currentPrayerHint"),
    nextPrayerLabel: byId("nextPrayerLabel"),
    nextPrayer: byId("nextPrayer"),
    nextPrayerTime: byId("nextPrayerTime"),
    countdownValue: byId("countdownValue"),
    progressDial: byId("progressDial"),
    progressRing: byId("progressRing"),
    progressRingGloss: byId("progressRingGloss"),
    progressKnob: byId("progressKnob"),
    tabBar: byId("tabBar"),
    tabActivePill: byId("tabActivePill"),
    tabDaily: byId("tabDaily"),
    tabMonthly: byId("tabMonthly"),
    tabSettings: byId("tabSettings"),
    pages: Array.from(document.querySelectorAll(".page")),
    enableNotificationsBtn: byId("enableNotificationsBtn"),
    monthlyTitle: byId("monthlyTitle"),
    monthlySubtitle: byId("monthlySubtitle"),
    monthlyCalendarGrid: byId("monthlyCalendarGrid"),
    monthlyHighlightsLabel: byId("monthlyHighlightsLabel"),
    monthlyHighlights: byId("monthlyHighlights"),
    settingsHeaderLabel: byId("settingsHeaderLabel"),
    aboutAppNameLabel: byId("aboutAppNameLabel"),
    aboutAppNameValue: byId("aboutAppNameValue"),
    aboutVersionLabel: byId("aboutVersionLabel"),
    aboutVersionValue: byId("aboutVersionValue"),
    aboutDescriptionLabel: byId("aboutDescriptionLabel"),
    aboutDescriptionValue: byId("aboutDescriptionValue"),
    fajr: byId("fajr"),
    sunrise: byId("sunrise"),
    dhuhr: byId("dhuhr"),
    asr: byId("asr"),
    maghrib: byId("maghrib"),
    isha: byId("isha"),
    labelFajr: byId("label-fajr"),
    labelSunrise: byId("label-sunrise"),
    labelDhuhr: byId("label-dhuhr"),
    labelAsr: byId("label-asr"),
    labelMaghrib: byId("label-maghrib"),
    labelIsha: byId("label-isha"),
    manualLocationCard: byId("manualLocationCard"),
    manualLocationTitle: byId("manualLocationTitle"),
    manualLocationMessage: byId("manualLocationMessage"),
    manualLocationRequestBtn: byId("manualLocationRequestBtn")
  };

  appState.refs.onCountdownComplete = () => renderApp();
}

function initTabs() {
  const controller = initBottomTabs({
    tabBar: appState.refs.tabBar,
    activePill: appState.refs.tabActivePill,
    onSelectPage: (pageId) => {
      appState.activePage = pageId;
      appState.refs.pages.forEach((page) => page.classList.toggle("active", page.id === pageId));
    }
  });

  controller.initialize();
}

function initProgressDial() {
  appState.refs.progressDialController = createProgressDialController({
    ring: appState.refs.progressRing,
    gloss: appState.refs.progressRingGloss,
    knob: appState.refs.progressKnob,
    countdown: appState.refs.countdownValue
  });
}

function bindEvents() {
  appState.refs.enableNotificationsBtn?.addEventListener("click", enableWebPush);
  appState.refs.manualLocationRequestBtn?.addEventListener("click", async () => {
    await requestCurrentLocation({ manual: true });
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) return;

    if (!appState.coords && !appState.geolocationRequestInFlight) {
      if (wasGeolocationDenied()) {
        showManualLocationRequest(true);
      } else if (!hasGeolocationBeenRequested()) {
        await requestCurrentLocation({ manual: false });
      }

      if (appState.coords) {
        renderApp();
      } else {
        renderLocationError();
      }
    } else {
      renderApp();
    }

    await updateNotificationButtonVisibility();
  });
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const alreadyControlled = !!navigator.serviceWorker.controller;

    const registration = await navigator.serviceWorker.register(
      WEB_APP_CONFIG.serviceWorkerPath,
      { updateViaCache: "none" }
    );

    registration.update().catch(() => {});

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (alreadyControlled) {
        window.location.reload();
      }
    });
  } catch (error) {
    console.error("Service worker registration failed:", error);
  }
}

async function hydrateLocation() {
  const saved = loadSavedLocation();

  if (saved) {
    appState.coords = { lat: saved.lat, lon: saved.lon };
    appState.placeNameAr = saved.nameAr || null;
    appState.placeNameEn = saved.nameEn || null;
    appState.placeName = pickCityName(appState) || formatCoords(saved.lat, saved.lon);
    showManualLocationRequest(false);
    return;
  }

  if (appState.refs.location) {
    appState.refs.location.textContent = appState.t("loading_location", "Loading location…");
  }

  if (wasGeolocationDenied()) {
    showManualLocationRequest(true);
    return;
  }

  if (!hasGeolocationBeenRequested()) {
    await requestCurrentLocation({ manual: false });
    return;
  }

  showManualLocationRequest(true);
}

async function requestCurrentLocation({ manual }) {
  if (appState.geolocationRequestInFlight) return;

  appState.geolocationRequestInFlight = true;

  if (!manual) {
    persistGeolocationRequested(true);
  }

  if (appState.refs.location) {
    appState.refs.location.textContent = appState.t("loading_location", "Loading location…");
  }

  try {
    const coords = await getLocation();

    appState.coords = coords;
    appState.showManualLocationRequest = false;
    showManualLocationRequest(false);
    persistGeolocationDenied(false);
    clearGeolocationPermissionState();

    appState.placeNameAr = await reverseGeocode(
      coords.lat,
      coords.lon,
      "ar",
      appState.t("unknown_location", "Unknown location")
    );

    appState.placeNameEn = await reverseGeocode(
      coords.lat,
      coords.lon,
      "en",
      appState.t("unknown_location", "Unknown location")
    );

    appState.placeName = pickCityName(appState) || formatCoords(coords.lat, coords.lon);

    persistLocation({
      lat: coords.lat,
      lon: coords.lon,
      nameAr: appState.placeNameAr,
      nameEn: appState.placeNameEn
    });

    renderApp();
  } catch (error) {
    console.error("Location access failed:", error);

    if (isGeolocationPermissionDenied(error)) {
      persistGeolocationDenied(true);
      appState.showManualLocationRequest = true;
      showManualLocationRequest(true);
    }

    renderLocationError();
  } finally {
    appState.geolocationRequestInFlight = false;
  }
}

function showManualLocationRequest(show) {
  appState.showManualLocationRequest = show;

  if (!appState.refs.manualLocationCard) return;

  appState.refs.manualLocationCard.hidden = !show;

  if (!show) return;

  if (appState.refs.manualLocationTitle) {
    appState.refs.manualLocationTitle.textContent = appState.t(
      "manual_location_title",
      "Location access needed"
    );
  }

  if (appState.refs.manualLocationMessage) {
    appState.refs.manualLocationMessage.textContent = appState.t(
      "manual_location_message",
      "Please allow location access to load prayer times for your current area."
    );
  }

  if (appState.refs.manualLocationRequestBtn) {
    appState.refs.manualLocationRequestBtn.textContent = appState.t(
      "manual_location_button",
      "Request location"
    );
  }
}

function applyTabLabels() {
  const tabLabels = [
    { button: appState.refs.tabDaily, key: "daily_tab", fallback: "Daily" },
    { button: appState.refs.tabMonthly, key: "monthly_tab", fallback: "Monthly" },
    { button: appState.refs.tabSettings, key: "settings_tab", fallback: "Settings" }
  ];

  tabLabels.forEach(({ button, key, fallback }) => {
    if (!button) return;

    const text = appState.t(key, fallback);
    button.querySelectorAll(".tab-label").forEach((label) => {
      label.textContent = text;
    });
  });
}

function renderLocationError() {
  if (!appState.refs.location) return;

  appState.refs.location.textContent = appState.t(
    "location_unavailable",
    "Unable to determine location"
  );

  appState.refs.title.textContent = appState.t("app_title_short", "Prayer");
  appState.refs.todayLabel.textContent = formatDisplayDate(new Date(), appState.lang);
  appState.refs.currentPrayerLabel.textContent = appState.t("current_prayer", "Current Prayer");
  appState.refs.nextPrayerLabel.textContent = appState.t("next_prayer", "Next Prayer");
  appState.refs.labelFajr.textContent = appState.t("fajr", "Fajr");
  appState.refs.labelSunrise.textContent = appState.t("sunrise", "Sunrise");
  appState.refs.labelDhuhr.textContent = appState.t("dhuhr", "Dhuhr");
  appState.refs.labelAsr.textContent = appState.t("asr", "Asr");
  appState.refs.labelMaghrib.textContent = appState.t("maghrib", "Maghrib");
  appState.refs.labelIsha.textContent = appState.t("isha", "Isha");
  applyTabLabels();

  renderMinaretSettingsPage({ state: appState, refs: appState.refs, config: WEB_APP_CONFIG });
  updateNotificationButtonVisibility();
}

function renderApp() {
  if (!appState.coords) {
    renderLocationError();
    return;
  }

  appState.placeName = pickCityName(appState) || formatCoords(appState.coords.lat, appState.coords.lon);

  if (appState.refs.manualLocationCard) {
    appState.refs.manualLocationCard.hidden = true;
  }

  appState.refs.location.textContent = appState.placeName;
  appState.refs.title.textContent = appState.t("app_title_short", "Prayer");
  appState.refs.todayLabel.textContent = formatDisplayDate(new Date(), appState.lang);
  appState.refs.currentPrayerLabel.textContent = appState.t("current_prayer", "Current Prayer");
  appState.refs.nextPrayerLabel.textContent = appState.t("next_prayer", "Next Prayer");
  appState.refs.labelFajr.textContent = appState.t("fajr", "Fajr");
  appState.refs.labelSunrise.textContent = appState.t("sunrise", "Sunrise");
  appState.refs.labelDhuhr.textContent = appState.t("dhuhr", "Dhuhr");
  appState.refs.labelAsr.textContent = appState.t("asr", "Asr");
  appState.refs.labelMaghrib.textContent = appState.t("maghrib", "Maghrib");
  appState.refs.labelIsha.textContent = appState.t("isha", "Isha");
  applyTabLabels();

  const times = prayerTimes({
    date: new Date(),
    latitude: appState.coords.lat,
    longitude: appState.coords.lon,
    adjustments: appState.settings
  });

  renderMinaretDailyPage({ state: appState, refs: appState.refs, times });
  renderMinaretMonthlyPage({ state: appState, refs: appState.refs });
  renderMinaretSettingsPage({ state: appState, refs: appState.refs, config: WEB_APP_CONFIG });

  updateNotificationButtonVisibility();
}

async function enableWebPush() {
  if (!appState.coords || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

  const registration = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    await updateNotificationButtonVisibility();
    return;
  }

  const vapidPublicKey = await fetch(`${WEB_APP_CONFIG.workerBaseUrl}/vapid-public-key`).then((r) => r.text());

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });
  }

  await fetch(`${WEB_APP_CONFIG.workerBaseUrl}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      lat: appState.coords.lat,
      lon: appState.coords.lon,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      name: appState.placeName,
      settings: appState.settings,
      language: appState.lang,
      userAgent: navigator.userAgent
    })
  });

  persistNotificationsEnabled(true);
  await updateNotificationButtonVisibility();
}

async function updateNotificationButtonVisibility() {
  const button = appState.refs.enableNotificationsBtn;
  if (!button) return;

  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    button.hidden = true;
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    const enabled = Notification.permission === "granted" && !!subscription;
    button.hidden = enabled;
  } catch {
    button.hidden = false;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}