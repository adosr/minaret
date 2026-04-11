export function updatePrayerRows(prayerState) {
  document.querySelectorAll(".prayer-row").forEach((row) => row.classList.remove("active", "next"));
  document.querySelector(`.prayer-row[data-key="${prayerState.currentKey}"]`)?.classList.add("active");
  document.querySelector(`.prayer-row[data-key="${prayerState.nextKey}"]`)?.classList.add("next");
}
