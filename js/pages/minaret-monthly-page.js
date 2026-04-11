import { formatMonthHeading } from "../utils/format.js";

export function renderMinaretMonthlyPage({ state, refs }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  refs.monthlyTitle.textContent = formatMonthHeading(today, state.lang);
  refs.monthlySubtitle.textContent = state.t("monthly_subtitle", "Current month overview");

  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const headers = state.lang === "ar"
    ? ["ح", "ن", "ث", "ر", "خ", "ج", "س"]
    : ["S", "M", "T", "W", "T", "F", "S"];

  const cells = [];
  for (const label of headers) {
    cells.push(`<div class="calendar-day header">${label}</div>`);
  }

  for (let i = 0; i < startDay; i++) {
    cells.push(`<div class="calendar-day"></div>`);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = day === today.getDate();
    cells.push(`<div class="calendar-day${isToday ? " today" : ""}">${day}</div>`);
  }

  refs.monthlyCalendarGrid.innerHTML = cells.join("");

  refs.monthlyHighlightsLabel.textContent = state.t("monthly_highlights", "Upcoming Highlights");
  refs.monthlyHighlights.innerHTML = `
    <div class="settings-row">
      <span>${state.t("current_month", "Current month")}</span>
      <span class="settings-value">${formatMonthHeading(today, state.lang)}</span>
    </div>
    <div class="settings-row">
      <span>${state.t("unknown_location", "Unknown location")}</span>
      <span class="settings-value">${state.placeName}</span>
    </div>
  `;
}
