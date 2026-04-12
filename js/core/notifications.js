import {
  loadNotificationPreferences,
  persistNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES
} from "../utils/storage.js";

const PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

let listenersBound = false;
let syncInFlight = false;
let lastSyncSignature = "";
let backgroundSyncTimer = null;

export function initializeNotificationState(state) {
  state.notificationPrefs = loadNotificationPreferences();
}

export function bindNotificationEvents({ state, refs, config }) {
  if (listenersBound) return;
  listenersBound = true;

  refs.notificationPrimaryActionBtn?.addEventListener("click", async () => {
    await handlePrimaryNotificationAction({ state, refs, config });
  });

  refs.notificationSecondaryActionBtn?.addEventListener("click", async () => {
    await disablePrayerNotifications({ state, refs, config });
  });

  PRAYER_KEYS.forEach((prayer) => {
    refs[`notify${capitalize(prayer)}Toggle`]?.addEventListener("click", async () => {
      state.notificationPrefs = ensurePrefs(state.notificationPrefs);
      state.notificationPrefs.prayers[prayer] = !state.notificationPrefs.prayers[prayer];
      persistNotificationPreferences(state.notificationPrefs);
      renderNotificationSettings({ state, refs });

      if (state.notificationPrefs.enabled) {
        scheduleBackgroundNotificationSync({ state, refs, config, force: true });
      }
    });
  });
}

export function renderNotificationSettings({ state, refs }) {
  const prefs = ensurePrefs(state.notificationPrefs);
  state.notificationPrefs = prefs;

  refs.notificationsHeaderLabel.textContent = state.t("notifications_header", "Prayer reminders");
  refs.notificationsStatusLabel.textContent = state.t("notifications_status_label", "Status");
  refs.notificationsSelectionLabel.textContent = state.t("notifications_selection_label", "Active reminders");

  refs.notifyFajrLabel.textContent = state.t("fajr", "Fajr");
  refs.notifyDhuhrLabel.textContent = state.t("dhuhr", "Dhuhr");
  refs.notifyAsrLabel.textContent = state.t("asr", "Asr");
  refs.notifyMaghribLabel.textContent = state.t("maghrib", "Maghrib");
  refs.notifyIshaLabel.textContent = state.t("isha", "Isha");

  const support = getNotificationSupport();
  const enabledCount = PRAYER_KEYS.filter((prayer) => prefs.prayers[prayer]).length;

  if (refs.notificationsSelectionValue) {
    refs.notificationsSelectionValue.textContent = enabledCount
      ? `${enabledCount}/5`
      : state.t("notifications_none_selected", "None selected");
  }

  PRAYER_KEYS.forEach((prayer) => {
    const button = refs[`notify${capitalize(prayer)}Toggle`];
    if (!button) return;

    const isOn = prefs.prayers[prayer] === true;
    button.classList.toggle("on", isOn);
    button.setAttribute("aria-pressed", String(isOn));
    button.disabled = !support.supported;
    button.title = state.t(
      isOn ? "notifications_toggle_on" : "notifications_toggle_off",
      isOn ? "Enabled" : "Disabled"
    );
  });

  const status = getStatusDescriptor({ state, support, enabledCount });
  if (refs.notificationsStatusValue) {
    refs.notificationsStatusValue.textContent = status.text;
  }

  if (refs.notificationPrimaryActionBtn) {
    refs.notificationPrimaryActionBtn.textContent = status.primaryAction;
    refs.notificationPrimaryActionBtn.disabled = !status.canEnable;
    refs.notificationPrimaryActionBtn.hidden = !status.showPrimaryAction;
  }

  if (refs.notificationSecondaryActionBtn) {
    refs.notificationSecondaryActionBtn.textContent = state.t(
      "notifications_disable_action",
      "Turn off Minaret reminders"
    );
    refs.notificationSecondaryActionBtn.hidden = !status.showDisableAction;
    refs.notificationSecondaryActionBtn.disabled = !support.supported;
  }
}

export function scheduleBackgroundNotificationSync({ state, refs, config, force = false, delay = 120 }) {
  if (backgroundSyncTimer) {
    clearTimeout(backgroundSyncTimer);
  }

  backgroundSyncTimer = window.setTimeout(() => {
    backgroundSyncTimer = null;
    syncNotificationSubscriptionSilently({ state, refs, config, force, visual: false }).catch((error) => {
      console.error("Background notification sync failed:", error);
    });
  }, delay);
}

export async function syncNotificationSubscriptionSilently({ state, refs, config, force = false, visual = false }) {
  const prefs = ensurePrefs(state.notificationPrefs);
  const support = getNotificationSupport();

  if (!support.supported || !prefs.enabled || Notification.permission !== "granted" || !state.coords) {
    renderNotificationSettings({ state, refs });
    return { ok: false, skipped: true };
  }

  const syncPayload = buildSyncPayload({ state });
  const signature = JSON.stringify(syncPayload);

  if (!force && signature === lastSyncSignature) {
    return { ok: true, skipped: true, automatic: true };
  }

  if (syncInFlight) {
    return { ok: false, skipped: true };
  }

  syncInFlight = true;
  if (visual) {
    renderNotificationSettings({ state, refs });
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const vapidPublicKey = await fetch(`${config.workerBaseUrl}/notifications/public-key`).then(assertTextResponse);

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
    }

    const res = await fetch(`${config.workerBaseUrl}/notifications/subscription`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...syncPayload,
        subscription: subscription.toJSON()
      })
    });

    const json = await assertJsonResponse(res);
    if (!json?.ok) {
      throw new Error(json?.error || "Notification sync failed.");
    }

    lastSyncSignature = signature;
    return { ...json, automatic: true };
  } catch (error) {
    console.error("Notification sync failed:", error);
    return { ok: false, error: String(error?.message || error) };
  } finally {
    syncInFlight = false;
    renderNotificationSettings({ state, refs });
  }
}

async function handlePrimaryNotificationAction({ state, refs, config }) {
  const support = getNotificationSupport();
  const enabledCount = PRAYER_KEYS.filter((prayer) => state.notificationPrefs?.prayers?.[prayer] !== false).length;
  const status = getStatusDescriptor({ state, support, enabledCount });

  if (!status.canEnable) {
    return;
  }

  if (status.action === "show_settings_help") {
    showSystemSettingsHelp(state);
    return;
  }

  await enablePrayerNotifications({ state, refs, config });
}

async function enablePrayerNotifications({ state, refs, config }) {
  const support = getNotificationSupport();
  state.notificationPrefs = ensurePrefs(state.notificationPrefs);

  if (!support.supported || !state.coords) {
    renderNotificationSettings({ state, refs });
    return;
  }

  if (Notification.permission === "denied") {
    showSystemSettingsHelp(state);
    renderNotificationSettings({ state, refs });
    return;
  }

  if (!PRAYER_KEYS.some((prayer) => state.notificationPrefs.prayers[prayer])) {
    state.notificationPrefs = structuredClone(DEFAULT_NOTIFICATION_PREFERENCES);
  }

  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      state.notificationPrefs.enabled = false;
      persistNotificationPreferences(state.notificationPrefs);
      renderNotificationSettings({ state, refs });
      return;
    }
  }

  persistNotificationPreferences({
    ...state.notificationPrefs,
    enabled: true
  });
  state.notificationPrefs.enabled = true;

  await syncNotificationSubscriptionSilently({ state, refs, config, force: true, visual: false });
}

async function disablePrayerNotifications({ state, refs, config }) {
  const prefs = ensurePrefs(state.notificationPrefs);
  prefs.enabled = false;
  state.notificationPrefs = prefs;
  persistNotificationPreferences(prefs);
  lastSyncSignature = "";

  try {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch(`${config.workerBaseUrl}/notifications/subscription`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        }).catch(() => {});

        await subscription.unsubscribe().catch(() => {});
      }
    }
  } catch (error) {
    console.error("Notification disable failed:", error);
  }

  renderNotificationSettings({ state, refs });
}

function getStatusDescriptor({ state, support, enabledCount }) {
  if (!support.supported) {
    return {
      action: "unsupported",
      text: state.t("notifications_status_unsupported", "This browser does not support push notifications."),
      primaryAction: state.t("notifications_enable_unavailable", "Notifications unavailable"),
      canEnable: false,
      showPrimaryAction: true,
      showDisableAction: false
    };
  }

  if (!state.coords) {
    return {
      action: "location_required",
      text: state.t("notifications_status_location_required", "Location access is required before reminders can be enabled."),
      primaryAction: state.t("notifications_location_required_action", "Location required first"),
      canEnable: false,
      showPrimaryAction: true,
      showDisableAction: false
    };
  }

  if (syncInFlight) {
    return {
      action: "syncing",
      text: state.t("notifications_status_syncing", "Saving reminder settings automatically…"),
      primaryAction: state.t("notifications_sync_action", "Saving automatically…"),
      canEnable: false,
      showPrimaryAction: true,
      showDisableAction: state.notificationPrefs?.enabled === true
    };
  }

  if (Notification.permission === "denied") {
    return {
      action: "show_settings_help",
      text: state.t(
        "notifications_status_denied",
        "iPhone notifications are turned off. Re-enable them from Settings, then come back to Minaret."
      ),
      primaryAction: state.t("notifications_open_settings_action", "How to enable in iPhone settings"),
      canEnable: true,
      showPrimaryAction: true,
      showDisableAction: false
    };
  }

  if (Notification.permission !== "granted") {
    return {
      action: "request_permission",
      text: state.t(
        "notifications_status_permission_needed",
        "Allow iPhone notifications first, then Minaret can subscribe this device for prayer reminders."
      ),
      primaryAction: state.t("notifications_allow_system_action", "Allow iPhone notifications"),
      canEnable: true,
      showPrimaryAction: true,
      showDisableAction: false
    };
  }

  if (state.notificationPrefs?.enabled) {
    return {
      action: "enabled",
      text:
        enabledCount > 0
          ? state.t("notifications_status_enabled", "Minaret reminders are active for the selected prayers.")
          : state.t("notifications_status_enabled_empty", "Minaret reminders are active, but no prayers are selected."),
      primaryAction: "",
      canEnable: false,
      showPrimaryAction: false,
      showDisableAction: true
    };
  }

  return {
    action: "enable_subscription",
    text: state.t(
      "notifications_status_system_allowed",
      "iPhone notifications are already allowed. Enable Minaret reminders when you are ready."
    ),
    primaryAction: state.t("notifications_enable_action", "Enable Minaret reminders"),
    canEnable: true,
    showPrimaryAction: true,
    showDisableAction: false
  };
}

function showSystemSettingsHelp(state) {
  const message = state.t(
    "notifications_settings_help_message",
    "To turn iPhone notifications back on: open Settings > Notifications > Minaret, then allow notifications and return to the app."
  );

  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(message);
  }
}

function buildSyncPayload({ state }) {
  return {
    lat: state.coords.lat,
    lon: state.coords.lon,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    name: state.placeName,
    settings: state.settings,
    language: state.lang,
    userAgent: navigator.userAgent,
    notificationPrefs: state.notificationPrefs
  };
}

function getNotificationSupport() {
  return {
    supported:
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
  };
}

function ensurePrefs(value) {
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

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function assertJsonResponse(response) {
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || `Request failed with ${response.status}`);
  }
  return json;
}

async function assertTextResponse(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return text;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
