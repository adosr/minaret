export function updatePrayerRows(prayerState) {
  // إزالة الحالات السابقة
  document.querySelectorAll(".prayer-row").forEach((row) => {
    row.classList.remove("active", "next");

    // حذف أي border قديم
    const border = row.querySelector(".border");
    if (border) border.remove();
  });

  // تحديد العنصر الحالي
  const currentRow = document.querySelector(`.prayer-row[data-key="${prayerState.currentKey}"]`);
  if (currentRow) {
    currentRow.classList.add("active");

    // إضافة border مباشرة بعد التاق
    const border = document.createElement("div");
    border.className = "border";
    currentRow.prepend(border);
  }

  // تحديد العنصر التالي
  const nextRow = document.querySelector(`.prayer-row[data-key="${prayerState.nextKey}"]`);
  if (nextRow) {
    nextRow.classList.add("next");
  }
}