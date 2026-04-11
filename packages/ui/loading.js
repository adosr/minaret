export function setBusyAttribute(element, value) {
  if (!element) return;
  if (value) element.setAttribute("aria-busy", "true");
  else element.removeAttribute("aria-busy");
}
