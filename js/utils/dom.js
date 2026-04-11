export function byId(id) {
  return document.getElementById(id);
}

export function queryAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}
