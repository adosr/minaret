import { prayerTimes } from "../../packages/shared/minaret-prayer-engine.js";
import { MINARET_PRAYER_KEYS } from "../../packages/shared/minaret-prayer-types.js";
import {
  formatDisplayDate,
  formatDisplayTime,
  formatMonthHeading,
  minutesToDate
} from "../utils/format.js";

export function renderMinaretMonthlyPage({ state, refs }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  refs.monthlyTitle.textContent = formatMonthHeading(today, state.lang);
  refs.monthlySubtitle.textContent = state.t(
    "monthly_subtitle",
    "Tap any day to view the full prayer times."
  );

  const rows = [];
  const monthDays = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const times = prayerTimes({
      date,
      latitude: state.coords.lat,
      longitude: state.coords.lon,
      adjustments: state.settings
    });

    const prayerState = getPrayerStateForDate(state, times.minutes, date, nowMinutes);
    const isToday = day === today.getDate();

    monthDays.push({ day, date, times, prayerState, isToday });

    rows.push(`
      <button
        class="calendar-day calendar-day--entry${isToday ? " today" : ""}"
        type="button"
        data-day="${day}"
        aria-pressed="false"
      >
        <span class="calendar-day-badge">
          <span class="calendar-day-number">${day}</span>
          <span class="calendar-day-weekday">${formatWeekday(date, state.lang)}</span>
        </span>

        <span class="calendar-day-columns">
          <span class="calendar-prayer-block">
            <span class="calendar-prayer-label">${state.t("current_prayer", "Current")}</span>
            <span class="calendar-prayer-value">${prayerState.currentLabel}</span>
            <span class="calendar-prayer-time">${formatDisplayTime(prayerState.startDate, state.lang)}</span>
          </span>

          <span class="calendar-prayer-block">
            <span class="calendar-prayer-label">${state.t("next_prayer", "Next")}</span>
            <span class="calendar-prayer-value">${prayerState.nextLabel}</span>
            <span class="calendar-prayer-time">${formatDisplayTime(prayerState.nextDate, state.lang)}</span>
          </span>
        </span>
      </button>
    `);
  }

  refs.monthlyCalendarGrid.innerHTML = rows.join("");
  refs.monthlyCalendarGrid.dataset.view = "list";

  const defaultSelectedDay = monthDays.find((entry) => entry.isToday)?.day || 1;
  updateSelectedDayDetails({ state, refs, monthDays, selectedDay: defaultSelectedDay });

  refs.monthlyCalendarGrid.querySelectorAll("[data-day]").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedDay = Number(button.dataset.day);
      updateSelectedDayDetails({ state, refs, monthDays, selectedDay });
    });
  });
}

function updateSelectedDayDetails({ state, refs, monthDays, selectedDay }) {
  const selected = monthDays.find((entry) => entry.day === selectedDay) || monthDays[0];
  if (!selected) return;

  refs.monthlyCalendarGrid.querySelectorAll("[data-day]").forEach((button) => {
    const isSelected = Number(button.dataset.day) === selected.day;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  refs.monthlyHighlightsLabel.textContent = state.t("monthly_day_details", "Day Details");
  refs.monthlyHighlights.innerHTML = `
    <div class="settings-row settings-row-multiline monthly-detail-heading-row">
      <span>${formatDisplayDate(selected.date, state.lang)}</span>
      <div class="settings-value settings-value-block monthly-detail-summary">
        ${state.t("current_prayer", "Current")}: ${selected.prayerState.currentLabel} · ${formatDisplayTime(selected.prayerState.startDate, state.lang)}<br>
        ${state.t("next_prayer", "Next")}: ${selected.prayerState.nextLabel} · ${formatDisplayTime(selected.prayerState.nextDate, state.lang)}
      </div>
    </div>
    ${MINARET_PRAYER_KEYS.map((key) => `
      <div class="settings-row">
        <span>${state.t(key, key)}</span>
        <span class="settings-value">${formatDisplayTime(minutesToDate(selected.times.minutes[key]), state.lang)}</span>
      </div>
    `).join("")}
  `;
}

function formatWeekday(date, lang) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en", {
    weekday: "short"
  }).format(date);
}

function getPrayerStateForDate(state, minutes, baseDate, currentMinutes) {
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
      startDate: buildDate(baseDate, minutes.isha, -1),
      nextDate: buildDate(baseDate, minutes.fajr, 0)
    };
  }

  if (currentMinutes < minutes.dhuhr) {
    return {
      currentKey: "fajr",
      currentLabel: labels.fajr,
      nextKey: "dhuhr",
      nextLabel: labels.dhuhr,
      startDate: buildDate(baseDate, minutes.fajr, 0),
      nextDate: buildDate(baseDate, minutes.dhuhr, 0)
    };
  }

  if (currentMinutes < minutes.asr) {
    return {
      currentKey: "dhuhr",
      currentLabel: labels.dhuhr,
      nextKey: "asr",
      nextLabel: labels.asr,
      startDate: buildDate(baseDate, minutes.dhuhr, 0),
      nextDate: buildDate(baseDate, minutes.asr, 0)
    };
  }

  if (currentMinutes < minutes.maghrib) {
    return {
      currentKey: "asr",
      currentLabel: labels.asr,
      nextKey: "maghrib",
      nextLabel: labels.maghrib,
      startDate: buildDate(baseDate, minutes.asr, 0),
      nextDate: buildDate(baseDate, minutes.maghrib, 0)
    };
  }

  if (currentMinutes < minutes.isha) {
    return {
      currentKey: "maghrib",
      currentLabel: labels.maghrib,
      nextKey: "isha",
      nextLabel: labels.isha,
      startDate: buildDate(baseDate, minutes.maghrib, 0),
      nextDate: buildDate(baseDate, minutes.isha, 0)
    };
  }

  return {
    currentKey: "isha",
    currentLabel: labels.isha,
    nextKey: "fajr",
    nextLabel: labels.fajr,
    startDate: buildDate(baseDate, minutes.isha, 0),
    nextDate: buildDate(baseDate, minutes.fajr, 1)
  };
}

function buildDate(baseDate, totalMinutes, dayOffset = 0) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return d;
}
