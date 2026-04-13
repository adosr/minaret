import { prayerTimes, formatTime } from "../../packages/shared/minaret-prayer-engine.js";
import { getMinaretPrayerLabel } from "../../packages/shared/minaret-prayer-constants.js";
import { getTimeZoneOffsetMinutes, getZonedDateParts, zonedLocalToUtcIso } from "../utils/time.js";
import {
  getJson,
  putJson,
  listKeys
} from "../utils/kv.js";
import {
  getSubscriptionRecord,
  putSubscriptionRecord,
  deleteSubscriptionRecord,
  sanitizeSettings,
  listSubscriptionKeys,
  sanitizeNotificationPreferences,
  isValidPushSubscription
} from "./subscription-service.js";
import { sendPush } from "./push-service.js";

const PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const DISPATCH_PREFIX = "dispatch:";

export async function runNotificationDispatch(env, now = new Date()) {
  const minuteToken = toUtcMinuteToken(now);
  const result = {
    ok: true,
    mode: "dispatch",
    minute_utc: minuteToken,
    keys_checked: 0,
    keys_found: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    pruned: 0,
    cleaned_dispatch_keys: 0,
    now_utc: now.toISOString()
  };

  for (const prayer of PRAYER_KEYS) {
    const dispatchKey = buildDispatchKey(minuteToken, prayer);
    result.keys_checked += 1;

    const entry = await getDispatchEntry(env, dispatchKey);
    if (!entry?.subs?.length) continue;

    result.keys_found += 1;

    for (const subKey of entry.subs) {
      result.attempted += 1;
      const record = await getSubscriptionRecord(env, subKey);
      if (!record?.subscription?.endpoint) continue;
      if (record?.notificationPrefs?.enabled !== true) continue;
      if (record?.notificationPrefs?.prayers?.[prayer] === false) continue;
	  
		const localDateKey = getCurrentLocalDateKey(now, record.timezone);

		if (record.scheduleDate !== localDateKey) {
		  await rebuildSubscriptionSchedule(env, subKey, record, now);
		  continue;
		}

      const scheduleMeta = record?.scheduleMeta?.[prayer] || null;
	  const notificationDateKey = scheduleMeta?.dateKey || localDateKey;

      try {
        await sendPush(env, record.subscription, buildNotificationPayload(record, prayer, notificationDateKey, scheduleMeta?.localTime || null));

        record.lastNotification = {
          id: `${notificationDateKey}:${prayer}`,
          prayer,
          dateKey: notificationDateKey,
          scheduledDispatchKey: dispatchKey,
          localTime: scheduleMeta?.localTime || null,
          sentAt: now.toISOString()
        };
        record.scheduledKeys = Array.isArray(record.scheduledKeys)
          ? record.scheduledKeys.filter((value) => value !== dispatchKey)
          : [];
        if (record.scheduleMeta && typeof record.scheduleMeta === "object") {
          delete record.scheduleMeta[prayer];
        }
        record.updatedAt = now.toISOString();
        await putSubscriptionRecord(env, subKey, record);
        result.sent += 1;
      } catch (error) {
        const message = String(error?.message || error);
        result.failed += 1;

        if (message.includes("410") || message.includes("404")) {
          await removeSubscriptionCompletely(env, subKey, record);
          result.pruned += 1;
        }
      }
    }

    await deleteDispatchEntry(env, dispatchKey);
    result.cleaned_dispatch_keys += 1;
  }

  return result;
}

export async function runScheduleMaintenance(env, now = new Date()) {
  const list = await listSubscriptionKeys(env);
  const result = {
    ok: true,
    mode: "maintenance",
    scanned: 0,
    rebuilt: 0,
    cleaned_disabled: 0,
    pruned: 0,
    now_utc: now.toISOString(),
    list_complete: list.list_complete
  };

  for (const item of list.keys) {
    result.scanned += 1;
    const subKey = item.name;
    const record = await getSubscriptionRecord(env, subKey);
    if (!record?.subscription?.endpoint) continue;

    if (!isValidPushSubscription(record.subscription)) {
      await removeSubscriptionCompletely(env, subKey, record);
      result.pruned += 1;
      continue;
    }

    if (record?.notificationPrefs?.enabled !== true) {
      if (Array.isArray(record?.scheduledKeys) && record.scheduledKeys.length) {
        await clearDispatchKeysForSubscription(env, subKey, record.scheduledKeys);
        record.scheduledKeys = [];
        record.scheduleMeta = {};
        record.updatedAt = now.toISOString();
        await putSubscriptionRecord(env, subKey, record);
        result.cleaned_disabled += 1;
      }
      continue;
    }

    const localDateKey = getCurrentLocalDateKey(now, record.timezone);
    const needsRebuild =
      record.scheduleDate !== localDateKey ||
      !Array.isArray(record.scheduledKeys) ||
      record.scheduledKeys.length === 0;

    if (!needsRebuild) continue;

    await rebuildSubscriptionSchedule(env, subKey, record, now);
    result.rebuilt += 1;
  }

  return result;
}

export async function rebuildSubscriptionSchedule(env, subKey, record, now = new Date()) {
  await clearDispatchKeysForSubscription(env, subKey, record?.scheduledKeys || []);

  const notificationPrefs = sanitizeNotificationPreferences(record.notificationPrefs);
  const schedule = buildSchedule(record, now, notificationPrefs);

  for (const [dispatchKey, payload] of schedule.entries) {
    await addSubscriptionToDispatch(env, dispatchKey, payload.prayer, subKey);
  }

  record.notificationPrefs = notificationPrefs;
  record.scheduleDate = schedule.dateKey;
  record.scheduledKeys = [...schedule.entries.keys()];
  record.scheduleMeta = schedule.scheduleMeta;
  record.updatedAt = now.toISOString();
  await putSubscriptionRecord(env, subKey, record);

  return schedule;
}

export async function removeSubscriptionCompletely(env, subKey, record = null) {
  const existing = record || await getSubscriptionRecord(env, subKey);
  if (existing?.scheduledKeys?.length) {
    await clearDispatchKeysForSubscription(env, subKey, existing.scheduledKeys);
  }
  await deleteSubscriptionRecord(env, subKey);
}

export async function clearDispatchKeysForSubscription(env, subKey, scheduledKeys = []) {
  const uniqueKeys = [...new Set(scheduledKeys.filter(Boolean))];
  for (const dispatchKey of uniqueKeys) {
    const entry = await getDispatchEntry(env, dispatchKey);
    if (!entry?.subs?.length) continue;

    const nextSubs = entry.subs.filter((value) => value !== subKey);
    if (nextSubs.length === 0) {
      await deleteDispatchEntry(env, dispatchKey);
      continue;
    }

    entry.subs = nextSubs;
    await putDispatchEntry(env, dispatchKey, entry);
  }
}

function buildSchedule(record, now, notificationPrefs) {
  const settings = sanitizeSettings(record.settings);
  const timeZone = record.timezone || "UTC";
  const dateParts = getZonedDateParts(now, timeZone);
  const dateKey = `${dateParts.year}-${String(dateParts.month).padStart(2, "0")}-${String(dateParts.day).padStart(2, "0")}`;
  const localNoon = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12, 0, 0));
  const tzOffsetMinutes = getTimeZoneOffsetMinutes(timeZone, localNoon);

  const times = prayerTimes({
    date: localNoon,
    latitude: record.lat,
    longitude: record.lon,
    adjustments: settings,
    tzOffsetMinutes
  });

  const entries = new Map();
  const scheduleMeta = {};

  for (const prayer of PRAYER_KEYS) {
    if (notificationPrefs?.prayers?.[prayer] === false) continue;

    const localTime = formatTime(times.raw[prayer]);
    if (!localTime || localTime === "--:--") continue;

    const utcIso = zonedLocalToUtcIso(`${dateKey}T${localTime}`, timeZone);
    const minuteToken = toUtcMinuteToken(new Date(utcIso));
    const dispatchKey = buildDispatchKey(minuteToken, prayer);

    entries.set(dispatchKey, { prayer });
    scheduleMeta[prayer] = {
      dateKey,
      localTime,
      dispatchKey,
      utcIso
    };
  }

  return { dateKey, entries, scheduleMeta };
}

function buildNotificationPayload(record, prayer, dateKey, localTime) {
  const language = record.language === "ar" ? "ar" : "en";
  const label = getMinaretPrayerLabel(prayer, language);
  const locationName = record.name ? ` · ${record.name}` : "";
  const bodyTime = localTime || record?.scheduleMeta?.[prayer]?.localTime || "--:--";

  return {
    title: language === "ar" ? `حان وقت ${label}` : `It's time for ${label}`,
    body:
      language === "ar"
        ? `${label} — ${bodyTime}${locationName}`
        : `${label} — ${bodyTime}${locationName}`,
    tag: `prayer-${prayer}-${dateKey}`,
    renotify: false,
    icon: "./img/iphone-192-app-icon.png",
    badge: "./img/iphone-180-app-icon.png",
    lang: language,
    data: {
      url: "./",
      prayer,
      dateKey
    }
  };
}

function getCurrentLocalDateKey(now, timeZone) {
  const parts = getZonedDateParts(now, timeZone || "UTC");
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function buildDispatchKey(minuteToken, prayer) {
  return `${DISPATCH_PREFIX}${minuteToken}:${prayer}`;
}

function toUtcMinuteToken(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}Z`;
}

async function getDispatchEntry(env, dispatchKey) {
  return getJson(env, dispatchKey, null);
}

async function putDispatchEntry(env, dispatchKey, value) {
  await putJson(env, dispatchKey, value);
}

async function deleteDispatchEntry(env, dispatchKey) {
  await env.SUBSCRIPTIONS.delete(dispatchKey);
}

async function addSubscriptionToDispatch(env, dispatchKey, prayer, subKey) {
  const entry = (await getDispatchEntry(env, dispatchKey)) || {
    prayer,
    subs: []
  };

  const nextSubs = new Set(Array.isArray(entry.subs) ? entry.subs : []);
  nextSubs.add(subKey);
  entry.prayer = prayer;
  entry.subs = [...nextSubs];

  await putDispatchEntry(env, dispatchKey, entry);
}

export async function listDispatchKeys(env, limit = 1000) {
  return listKeys(env, DISPATCH_PREFIX, limit);
}
