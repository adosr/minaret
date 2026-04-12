import { prayerTimes, formatTime } from "../../packages/shared/minaret-prayer-engine.js";
import { getMinaretPrayerLabel } from "../../packages/shared/minaret-prayer-constants.js";
import { getTimeZoneOffsetMinutes, getZonedDateTimeParts } from "../utils/time.js";
import { listSubscriptionKeys, getSubscriptionRecord, putSubscriptionRecord, deleteSubscriptionRecord, sanitizeSettings } from "./subscription-service.js";
import { sendPush } from "./push-service.js";

const PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

export async function runNotificationSchedule(env) {
  const list = await listSubscriptionKeys(env);
  const now = new Date();

  const result = {
    ok: true,
    scanned: 0,
    due: 0,
    sent: 0,
    failed: 0,
    pruned: 0,
    now_utc: now.toISOString()
  };

  for (const item of list.keys) {
    result.scanned += 1;

    const record = await getSubscriptionRecord(env, item.name);
    if (!record?.subscription?.endpoint) continue;
    if (record?.notificationPrefs?.enabled !== true) continue;

    const due = getDuePrayer(record, now);
    if (!due) continue;

    result.due += 1;

    try {
      await sendPush(env, record.subscription, buildNotificationPayload(record, due));

      record.lastNotification = {
        id: due.id,
        prayer: due.prayer,
        dateKey: due.dateKey,
        dueAt: due.dueAt,
        sentAt: now.toISOString()
      };
      record.updatedAt = now.toISOString();

      await putSubscriptionRecord(env, item.name, record);
      result.sent += 1;
    } catch (error) {
      const message = String(error?.message || error);
      result.failed += 1;

      if (message.includes("410") || message.includes("404")) {
        await deleteSubscriptionRecord(env, item.name);
        result.pruned += 1;
      }
    }
  }

  return result;
}

function getDuePrayer(record, now) {
  if (!Number.isFinite(record.lat) || !Number.isFinite(record.lon) || !record.timezone) {
    return null;
  }

  const localNow = getZonedDateTimeParts(now, record.timezone);
  const nowLocalMinutes = localNow.hour * 60 + localNow.minute;
  const previousLocalMinute = (nowLocalMinutes + 1439) % 1440;
  const dateKey = `${localNow.year}-${String(localNow.month).padStart(2, "0")}-${String(localNow.day).padStart(2, "0")}`;

  const localNoon = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day, 12, 0, 0));
  const settings = sanitizeSettings(record.settings);
  const tzOffsetMinutes = getTimeZoneOffsetMinutes(record.timezone, localNoon) + settings.timezoneMinutes;

  const times = prayerTimes({
    date: localNoon,
    latitude: record.lat,
    longitude: record.lon,
    adjustments: settings,
    tzOffsetMinutes
  });

  for (const prayer of PRAYER_KEYS) {
    if (record?.notificationPrefs?.prayers?.[prayer] === false) continue;

    const dueMinutes = times.minutes[prayer];
    if (!Number.isFinite(dueMinutes) || (dueMinutes !== nowLocalMinutes && dueMinutes !== previousLocalMinute)) continue;

    const id = `${dateKey}:${prayer}`;
    if (record?.lastNotification?.id === id) continue;

    const hh = String(Math.floor(dueMinutes / 60)).padStart(2, "0");
    const mm = String(dueMinutes % 60).padStart(2, "0");

    return {
      id,
      prayer,
      dateKey,
      dueAt: `${dateKey}T${hh}:${mm}`,
      formattedTime: formatTime(times.raw[prayer])
    };
  }

  return null;
}

function buildNotificationPayload(record, due) {
  const language = record.language === "ar" ? "ar" : "en";
  const label = getMinaretPrayerLabel(due.prayer, language);

  return {
    title: language === "ar" ? `حان وقت ${label}` : `It's time for ${label}`,
    body:
      language === "ar"
        ? `${label} — ${due.formattedTime}`
        : `${label} — ${due.formattedTime}`,
    tag: `prayer-${due.prayer}-${due.dateKey}`,
    renotify: false,
    icon: "./img/iphone-192-app-icon.png",
    badge: "./img/iphone-180-app-icon.png",
    lang: language,
    data: {
      url: "./",
      prayer: due.prayer,
      dateKey: due.dateKey
    }
  };
}
