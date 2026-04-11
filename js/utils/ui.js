export function setText(element, value) {
  if (element) element.textContent = value;
}

export function setHidden(element, hidden) {
  if (element) element.hidden = !!hidden;
}
