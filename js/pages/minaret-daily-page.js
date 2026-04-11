import { formatDisplayTime, minutesToDate } from "../utils/format.js";
import { updatePrayerRows } from "../components/minaret-prayers-list.js";
import { MINARET_MAIN_PRAYER_KEYS } from "../../packages/shared/minaret-prayer-types.js";

export function renderMinaretDailyPage({ state, refs, times }) {
  const prayerState = getPrayerState(state, times.minutes, new Date());

  refs.currentPrayer.textContent = prayerState.currentLabel;
  refs.currentPrayerHint.textContent = formatDisplayTime(prayerState.startDate, state.lang);

  refs.nextPrayer.textContent = prayerState.nextLabel;
  refs.nextPrayerTime.textContent = formatDisplayTime(prayerState.nextDate, state.lang);

  for (const key of ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]) {
    refs[key].textContent = formatDisplayTime(minutesToDate(times.minutes[key]), state.lang);
  }

  refs.progressDialController.reset();
  startCountdown({ state, refs, prayerState });
  updatePrayerRows(prayerState);
}

function getPrayerState(state, minutes, now) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const labels = {
    fajr: state.t("fajr", "Fajr"),
    dhuhr: state.t("dhuhr", "Dhuhr"),
    asr: state.t("asr", "Asr"),
    maghrib: state.t("maghrib", "Maghrib"),
    isha: state.t("isha", "Isha")
  };

  if (currentMinutes < minutes.fajr) {
    return {
      currentKey: "isha",
      currentLabel: labels.isha,
      nextKey: "fajr",
      nextLabel: labels.fajr,
      startDate: buildDate(now, minutes.isha, -1),
      nextDate: buildDate(now, minutes.fajr, 0)
    };
  }

  if (currentMinutes < minutes.dhuhr) {
    return {
      currentKey: "fajr",
      currentLabel: labels.fajr,
      nextKey: "dhuhr",
      nextLabel: labels.dhuhr,
      startDate: buildDate(now, minutes.fajr, 0),
      nextDate: buildDate(now, minutes.dhuhr, 0)
    };
  }

  if (currentMinutes < minutes.asr) {
    return {
      currentKey: "dhuhr",
      currentLabel: labels.dhuhr,
      nextKey: "asr",
      nextLabel: labels.asr,
      startDate: buildDate(now, minutes.dhuhr, 0),
      nextDate: buildDate(now, minutes.asr, 0)
    };
  }

  if (currentMinutes < minutes.maghrib) {
    return {
      currentKey: "asr",
      currentLabel: labels.asr,
      nextKey: "maghrib",
      nextLabel: labels.maghrib,
      startDate: buildDate(now, minutes.asr, 0),
      nextDate: buildDate(now, minutes.maghrib, 0)
    };
  }

  if (currentMinutes < minutes.isha) {
    return {
      currentKey: "maghrib",
      currentLabel: labels.maghrib,
      nextKey: "isha",
      nextLabel: labels.isha,
      startDate: buildDate(now, minutes.maghrib, 0),
      nextDate: buildDate(now, minutes.isha, 0)
    };
  }

  return {
    currentKey: "isha",
    currentLabel: labels.isha,
    nextKey: "fajr",
    nextLabel: labels.fajr,
    startDate: buildDate(now, minutes.isha, 0),
    nextDate: buildDate(now, minutes.fajr, 1)
  };
}

function buildDate(baseDate, totalMinutes, dayOffset = 0) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return d;
}

function startCountdown({ state, refs, prayerState }) {
  if (state.countdownTimer) clearInterval(state.countdownTimer);

  const tick = () => {
    const now = new Date();
    const total = Math.max(1000, prayerState.nextDate.getTime() - prayerState.startDate.getTime());
    const remaining = Math.max(0, prayerState.nextDate.getTime() - now.getTime());
    const elapsed = Math.max(0, now.getTime() - prayerState.startDate.getTime());

    const ratio = Math.max(0, Math.min(1, elapsed / total));

    const h = String(Math.floor(remaining / 3600000)).padStart(2, "0");
    const m = String(Math.floor((remaining % 3600000) / 60000)).padStart(2, "0");
    const s = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");

    refs.progressDialController.render(ratio, `${h}:${m}:${s}`);

    if (remaining <= 0) {
		clearInterval(state.countdownTimer);
		state.countdownTimer = null;
      if (typeof refs.onCountdownComplete === "function") refs.onCountdownComplete();
    }
  };

  tick();
  state.countdownTimer = setInterval(tick, 1000);
}
