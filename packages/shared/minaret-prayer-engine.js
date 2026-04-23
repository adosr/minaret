import {
  MINARET_FAJR_ANGLE,
  MINARET_DHUHR_BUFFER_MINUTES,
  MINARET_MAGHRIB_BUFFER_MINUTES,
  MINARET_ISHA_OFFSET_HOURS
} from "./minaret-prayer-constants.js";

const DEG = Math.PI / 180;

export function prayerTimes({
  date = new Date(),
  latitude,
  longitude,
  adjustments = {},
  tzOffsetMinutes = null
}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("latitude/longitude are required");
  }

  const calculationDate = normalizeCalculationDate(date, tzOffsetMinutes != null);

  const tzHours = tzOffsetMinutes == null
    ? (-calculationDate.getTimezoneOffset() / 60) + ((adjustments.timezoneMinutes || 0) / 60)
    : (tzOffsetMinutes / 60);

  const jd = julian(calculationDate) - longitude / 360;
  const solar = solarPosition(jd);
  const noon = 12 + tzHours - longitude / 15 - solar.eqTime;

  let fajr = sunAngleTime(MINARET_FAJR_ANGLE, "ccw", latitude, solar.dec, noon);
  const sunrise = sunAngleTime(0.833, "ccw", latitude, solar.dec, noon);
  const dhuhr = noon + (MINARET_DHUHR_BUFFER_MINUTES / 60);
  const asr = asrTime(1, latitude, solar.dec, noon);
  const sunset = sunAngleTime(0.833, "cw", latitude, solar.dec, noon);
  const maghrib = sunset + (MINARET_MAGHRIB_BUFFER_MINUTES / 60);
  const isha = maghrib + MINARET_ISHA_OFFSET_HOURS;

  const night = positiveDiffHours(sunrise, sunset);
  if (fajr === null || Number.isNaN(fajr)) {
    fajr = sunrise - night * (MINARET_FAJR_ANGLE / 60);
  }

  const times = {
    fajr: offsetHours(fajr, adjustments.fajr || 0),
    sunrise: offsetHours(sunrise, adjustments.sunrise || 0),
    dhuhr: offsetHours(dhuhr, adjustments.dhuhr || 0),
    asr: offsetHours(asr, adjustments.asr || 0),
    maghrib: offsetHours(maghrib, adjustments.maghrib || 0),
    isha: offsetHours(isha, adjustments.isha || 0)
  };

  return {
    raw: times,
    formatted: Object.fromEntries(Object.entries(times).map(([key, value]) => [key, formatTime(value)])),
    minutes: Object.fromEntries(Object.entries(times).map(([key, value]) => [key, toMinutes(value)]))
  };
}

export function toMinutes(hourValue) {
  if (hourValue == null) return null;
  const normalized = ((hourValue % 24) + 24) % 24;
  return Math.round(normalized * 60) % 1440;
}

export function formatTime(hourValue) {
  if (hourValue == null) return "--:--";
  const total = toMinutes(hourValue);
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}


function normalizeCalculationDate(date, useUtcComponents = false) {
  if (useUtcComponents) {
    return new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12, 0, 0, 0
    ));
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12, 0, 0, 0
  );
}

function julian(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function solarPosition(jd) {
  const d = jd - 2451545;
  const g = fixAngle(357.529 + 0.98560028 * d);
  const q = fixAngle(280.459 + 0.98564736 * d);
  const L = fixAngle(q + 1.915 * Math.sin(g * DEG) + 0.020 * Math.sin(2 * g * DEG));
  const e = 23.439 - 0.00000036 * d;

  const dec = Math.asin(Math.sin(e * DEG) * Math.sin(L * DEG)) / DEG;
  const ra = Math.atan2(Math.cos(e * DEG) * Math.sin(L * DEG), Math.cos(L * DEG)) / DEG / 15;
  const eqTime = q / 15 - fixHour(ra);
  return { dec, eqTime };
}

function sunAngleTime(angle, dir, lat, dec, noon) {
  const latRad = lat * DEG;
  const decRad = dec * DEG;
  const angRad = angle * DEG;

  const cosH =
    (-Math.sin(angRad) - Math.sin(latRad) * Math.sin(decRad)) /
    (Math.cos(latRad) * Math.cos(decRad));

  if (cosH < -1 || cosH > 1) return null;

  const H = Math.acos(cosH) / DEG / 15;
  return dir === "ccw" ? noon - H : noon + H;
}

function asrTime(factor, lat, dec, noon) {
  const angle = -Math.atan(1 / (factor + Math.tan(Math.abs((lat - dec) * DEG)))) / DEG;
  return sunAngleTime(angle, "cw", lat, dec, noon);
}

function positiveDiffHours(later, earlier) {
  if (later == null || earlier == null) return 0;
  let diff = later - earlier;
  if (diff < 0) diff += 24;
  return diff;
}

function offsetHours(hourValue, minutes) {
  if (hourValue == null) return null;
  return hourValue + (minutes / 60);
}

function fixAngle(a) {
  return (a % 360 + 360) % 360;
}

function fixHour(h) {
  return (h % 24 + 24) % 24;
}
