import { prayerTimes, formatTime } from "../../packages/shared/minaret-prayer-engine.js";
import { getMinaretPrayerLabel } from "../../packages/shared/minaret-prayer-constants.js";
import { getJson, putJson } from "../utils/kv.js";
import {
  bucketKeyFromDate,
  bucketKeyFromIso,
  localDateKey,
  getZonedDatePartsPlus,
  getTimeZoneOffsetMinutes,
  zonedLocalToUtcIso,
  addDaysToDateParts,
  parseDateKey
} from "../utils/time.js";
import { sanitizeSettings } from "./subscription-service.js";
import { sendPush } from "./push-service.js";

export async function buildInitialBuckets(env, subKey, record, daysAhead = 7) {
  const entries = createPrayerBucketEntriesForRecord(subKey, record, daysAhead);
  for (const { bucketKey, entry } of entries) {
    await upsertBucketEntries(env, bucketKey, [entry]);
  }
}

export async function removeScheduledBucketsForRecord(env, subKey, record, daysAhead = 7) {
  const entries = createPrayerBucketEntriesForRecord(subKey, record, daysAhead);

  for (const { bucketKey, entry } of entries) {
    const raw = await getJson(env, bucketKey, []);
    const filtered = raw.filter((item) => item.id !== entry.id);
    if (filtered.length === 0) await env.SUBSCRIPTIONS.delete(bucketKey);
    else if (filtered.length !== raw.length) await putJson(env, bucketKey, filtered);
  }
}

export async function runScheduledBucket(env) {
  const now = new Date();
  const bucketKey = bucketKeyFromDate(now);
  const entries = await getJson(env, bucketKey, null);

  console.log("Cron bucket check", {
    bucketKey,
    hasEntries: Boolean(entries),
    entryCount: Array.isArray(entries) ? entries.length : 0
  });

  if (!entries) return;

  for (const entry of entries) {
    try {
      await sendPush(env, entry.subscription, {
        title: entry.title,
        options: {
          body: entry.body,
          tag: entry.tag,
          renotify: entry.renotify ?? false
        }
      });

      console.log("Bucket send success", {
        bucketKey,
        entryId: entry?.id || null,
        subKey: entry?.subKey || null,
        type: entry?.type || null
      });

      if (entry.type === "prayer-push") {
        await scheduleNextPrayerFromEntry(env, entry);
      }
    } catch (err) {
      const msg = String(err?.message || err);

      console.error("Bucket send failed", {
        bucketKey,
        entryId: entry?.id || null,
        subKey: entry?.subKey || null,
        error: msg
      });

      if ((msg.includes("410") || msg.includes("404")) && entry.subKey) {
        await env.SUBSCRIPTIONS.delete(entry.subKey);
      }
    }
  }

  await env.SUBSCRIPTIONS.delete(bucketKey);
}

export async function sendManualPushNow(env, records, payload) {
  let sent = 0;
  let failed = 0;
  const errors = [];

  console.log("Manual push start", {
    records: records.length,
    title: payload?.title || null,
    tag: payload?.options?.tag || null
  });

  for (const { subKey, record } of records) {
    try {
      await sendPush(env, record.subscription, payload);

      record.lastSent = {
        prayer: "manual",
        date: localDateKey(new Date()),
        sentAt: new Date().toISOString()
      };

      await env.SUBSCRIPTIONS.put(subKey, JSON.stringify(record));
      sent += 1;

      console.log("Manual push success", {
        subKey,
        endpoint: record?.subscription?.endpoint || null
      });
    } catch (error) {
      const msg = String(error?.message || error);
      failed += 1;

      console.error("Manual push failed", {
        subKey,
        endpoint: record?.subscription?.endpoint || null,
        error: msg
      });

      errors.push({
        subKey,
        endpoint: record?.subscription?.endpoint || null,
        error: msg
      });

      if (msg.includes("410") || msg.includes("404")) {
        await env.SUBSCRIPTIONS.delete(subKey);
      }
    }
  }

  return {
    attempted: records.length,
    sent,
    failed,
    errors
  };
}

export async function scheduleManualPush(env, records, payload, dueAt) {
  const bucketKey = bucketKeyFromIso(dueAt);
  const entries = records.map(({ subKey, record }) => ({
    id: `manual:${crypto.randomUUID()}`,
    type: "manual-push",
    dueAt,
    subKey,
    subscription: record.subscription,
    title: payload.title,
    body: payload.options.body,
    tag: payload.options.tag,
    renotify: payload.options.renotify ?? false
  }));
  await upsertBucketEntries(env, bucketKey, entries);
  return { bucketKey, count: entries.length };
}

function createPrayerBucketEntriesForRecord(subKey, record, daysAhead = 7) {
  const result = [];

  for (let i = 0; i < daysAhead; i++) {
    const dateParts = getZonedDatePartsPlus(record.timezone, i);
    const prayerEntries = calculatePrayersForDateParts(dateParts, record);

    for (const p of prayerEntries) {
      result.push({
        bucketKey: bucketKeyFromIso(p.dueAt),
        entry: {
          id: `prayer:${subKey}:${p.dateKey}:${p.prayer}:v${record.scheduleVersion}`,
          type: "prayer-push",
          subKey,
          prayer: p.prayer,
          dateKey: p.dateKey,
          dueAt: p.dueAt,
          subscription: record.subscription,
          title: p.title,
          body: p.body,
          tag: p.tag,
          renotify: false,
          scheduleVersion: record.scheduleVersion,
          lat: record.lat,
          lon: record.lon,
          timezone: record.timezone,
          language: record.language === "en" ? "en" : "ar",
          settings: sanitizeSettings(record.settings)
        }
      });
    }
  }

  return result;
}

function calculatePrayersForDateParts(dateParts, record) {
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12, 0, 0));
  const tzOffsetMinutes =
    getTimeZoneOffsetMinutes(record.timezone, date) + (record.settings?.timezoneMinutes || 0);

  const times = prayerTimes({
    date,
    latitude: record.lat,
    longitude: record.lon,
    adjustments: record.settings || {},
    tzOffsetMinutes
  });

  const dateKey = `${dateParts.year}-${String(dateParts.month).padStart(2, "0")}-${String(dateParts.day).padStart(2, "0")}`;
  const lang = record.language === "en" ? "en" : "ar";

  return ["fajr", "dhuhr", "asr", "maghrib", "isha"].map((prayer) => {
    const totalMinutes = times.minutes[prayer];
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    const localDateTimeString = `${dateParts.year}-${String(dateParts.month).padStart(2, "0")}-${String(dateParts.day).padStart(2, "0")}T${hh}:${mm}`;
    const dueAt = zonedLocalToUtcIso(localDateTimeString, record.timezone);
    const label = getMinaretPrayerLabel(prayer, lang);
    const formatted = formatTime(times.raw[prayer]);

    return {
      prayer,
      dateKey,
      dueAt,
      title: lang === "ar" ? `حان وقت ${label}` : `It's time for ${label}`,
      body: `${label} — ${formatted}`,
      tag: `prayer-${prayer}-${dateKey}`
    };
  });
}

async function upsertBucketEntries(env, bucketKey, newEntries) {
  const arr = await getJson(env, bucketKey, []);
  const map = new Map(arr.map((item) => [item.id, item]));
  for (const entry of newEntries) map.set(entry.id, entry);
  await putJson(env, bucketKey, [...map.values()]);
}

async function scheduleNextPrayerFromEntry(env, entry) {
  const nextDateParts = addDaysToDateParts(parseDateKey(entry.dateKey), 7);
  const next = createPrayerBucketEntryFromSnapshot(nextDateParts, entry);
  if (!next) return;
  await upsertBucketEntries(env, next.bucketKey, [next.entry]);
}

function createPrayerBucketEntryFromSnapshot(dateParts, snapshot) {
  const recordLike = {
    lat: snapshot.lat,
    lon: snapshot.lon,
    timezone: snapshot.timezone,
    language: snapshot.language,
    settings: sanitizeSettings(snapshot.settings),
    subscription: snapshot.subscription,
    scheduleVersion: snapshot.scheduleVersion
  };

  const prayerEntries = calculatePrayersForDateParts(dateParts, recordLike);
  const p = prayerEntries.find((item) => item.prayer === snapshot.prayer);
  if (!p) return null;

  return {
    bucketKey: bucketKeyFromIso(p.dueAt),
    entry: {
      id: `prayer:${snapshot.subKey}:${p.dateKey}:${p.prayer}:v${snapshot.scheduleVersion}`,
      type: "prayer-push",
      subKey: snapshot.subKey,
      prayer: p.prayer,
      dateKey: p.dateKey,
      dueAt: p.dueAt,
      subscription: snapshot.subscription,
      title: p.title,
      body: p.body,
      tag: p.tag,
      renotify: false,
      scheduleVersion: snapshot.scheduleVersion,
      lat: snapshot.lat,
      lon: snapshot.lon,
      timezone: snapshot.timezone,
      language: snapshot.language === "en" ? "en" : "ar",
      settings: sanitizeSettings(snapshot.settings)
    }
  };
}
