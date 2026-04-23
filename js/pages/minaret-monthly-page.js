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

  if (refs.monthlyHighlightsLabel) refs.monthlyHighlightsLabel.hidden = true;
  if (refs.monthlyHighlights) {
    refs.monthlyHighlights.hidden = true;
    refs.monthlyHighlights.innerHTML = "";
  }

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
    const prayerDetails = MINARET_PRAYER_KEYS.map((key) => `
      <div class="monthly-prayer-detail-row">
        <span>${state.t(key, key)}</span>
        <span class="settings-value">${formatDisplayTime(minutesToDate(times.minutes[key]), state.lang)}</span>
      </div>
    `).join("");

    monthDays.push({ day, date, times, prayerState, isToday });

    rows.push(`
      <button
        class="calendar-day calendar-day--entry${isToday ? " today" : ""}"
        type="button"
        data-day="${day}"
        data-expanded="false"
        aria-expanded="false"
      >
        <span class="calendar-day-summary">
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
        </span>

        <div class="monthly-day-details" aria-hidden="true">
          <div class="monthly-day-prayers">${prayerDetails}</div>
        </div>
      </button>
    `);
  }

  refs.monthlyCalendarGrid.innerHTML = rows.join("");
  refs.monthlyCalendarGrid.dataset.view = "list";

  setExpandedDay(refs.monthlyCalendarGrid, null);

  refs.monthlyCalendarGrid.querySelectorAll("[data-day]").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedDay = Number(button.dataset.day);
      const isExpanded = button.dataset.expanded === "true";
      setExpandedDay(refs.monthlyCalendarGrid, isExpanded ? null : selectedDay);
    });
  });
}

function setExpandedDay(container, selectedDay) {
  container.querySelectorAll("[data-day]").forEach((button) => {
    const isSelected = selectedDay !== null && Number(button.dataset.day) === selectedDay;
    button.classList.toggle("selected", isSelected);
    button.dataset.expanded = String(isSelected);
    button.setAttribute("aria-expanded", String(isSelected));

    const details = button.querySelector(".monthly-day-details");
    if (details) details.setAttribute("aria-hidden", String(!isSelected));
  });
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
