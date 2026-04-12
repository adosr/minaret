import {
  loadNotificationPreferences,
  persistNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES
} from "../utils/storage.js";

const PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

let listenersBound = false;
let syncInFlight = false;
let lastSyncSignature = "";

export function initializeNotificationState(state) {
  state.notificationPrefs = loadNotificationPreferences();
}

export function bindNotificationEvents({ state, refs, config }) {
  if (listenersBound) return;
  listenersBound = true;

  refs.notificationPrimaryActionBtn?.addEventListener("click", async () => {
    await enablePrayerNotifications({ state, refs, config });
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
        await syncNotificationSubscriptionSilently({ state, refs, config, force: true });
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
  }

  if (refs.notificationSecondaryActionBtn) {
    refs.notificationSecondaryActionBtn.textContent = state.t(
      "notifications_disable_action",
      "Turn off reminders"
    );
    refs.notificationSecondaryActionBtn.hidden = !prefs.enabled;
    refs.notificationSecondaryActionBtn.disabled = !support.supported;
  }
}

export async function syncNotificationSubscriptionSilently({ state, refs, config, force = false }) {
  const prefs = ensurePrefs(state.notificationPrefs);
  const support = getNotificationSupport();

  if (!support.supported || !prefs.enabled || Notification.permission !== "granted" || !state.coords) {
    renderNotificationSettings({ state, refs });
    return { ok: false, skipped: true };
  }

  const syncPayload = buildSyncPayload({ state });
  const signature = JSON.stringify(syncPayload);

  if (!force && signature === lastSyncSignature) {
    return { ok: true, skipped: true };
  }

  if (syncInFlight) {
    return { ok: false, skipped: true };
  }

  syncInFlight = true;
  renderNotificationSettings({ state, refs });

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
    renderNotificationSettings({ state, refs });
    return json;
  } catch (error) {
    console.error("Notification sync failed:", error);
    renderNotificationSettings({ state, refs });
    return { ok: false, error: String(error?.message || error) };
  } finally {
    syncInFlight = false;
    renderNotificationSettings({ state, refs });
  }
}

async function enablePrayerNotifications({ state, refs, config }) {
  const support = getNotificationSupport();
  state.notificationPrefs = ensurePrefs(state.notificationPrefs);

  if (!support.supported) {
    renderNotificationSettings({ state, refs });
    return;
  }

  if (!state.coords) {
    renderNotificationSettings({ state, refs });
    return;
  }

  if (!PRAYER_KEYS.some((prayer) => state.notificationPrefs.prayers[prayer])) {
    state.notificationPrefs = structuredClone(DEFAULT_NOTIFICATION_PREFERENCES);
  }

  persistNotificationPreferences({
    ...state.notificationPrefs,
    enabled: true
  });
  state.notificationPrefs.enabled = true;

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    state.notificationPrefs.enabled = false;
    persistNotificationPreferences(state.notificationPrefs);
    renderNotificationSettings({ state, refs });
    return;
  }

  await syncNotificationSubscriptionSilently({ state, refs, config, force: true });
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
      text: state.t("notifications_status_unsupported", "This browser does not support push notifications."),
      primaryAction: state.t("notifications_enable_unavailable", "Notifications unavailable"),
      canEnable: false
    };
  }

  if (!state.coords) {
    return {
      text: state.t("notifications_status_location_required", "Location access is required before reminders can be enabled."),
      primaryAction: state.t("notifications_enable_action", "Enable prayer reminders"),
      canEnable: false
    };
  }

  if (Notification.permission === "denied") {
    return {
      text: state.t("notifications_status_denied", "Notifications are blocked in the browser settings."),
      primaryAction: state.t("notifications_permission_blocked", "Notifications blocked"),
      canEnable: false
    };
  }

  if (syncInFlight) {
    return {
      text: state.t("notifications_status_syncing", "Saving reminder settings…"),
      primaryAction: state.t("notifications_sync_action", "Syncing reminder settings…"),
      canEnable: false
    };
  }

  if (state.notificationPrefs?.enabled) {
    return {
      text:
        enabledCount > 0
          ? state.t("notifications_status_enabled", "Prayer reminders are active for the selected prayers.")
          : state.t("notifications_status_enabled_empty", "Notifications are enabled, but no prayers are selected."),
      primaryAction: state.t("notifications_sync_action_idle", "Sync reminder settings"),
      canEnable: true
    };
  }

  return {
    text: state.t("notifications_status_disabled", "Prayer reminders are currently turned off."),
    primaryAction: state.t("notifications_enable_action", "Enable prayer reminders"),
    canEnable: true
  };
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
