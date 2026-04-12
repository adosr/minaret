export function enableSkeleton() {
  document.body.classList.remove("ui-ready");
  document.body.classList.add("ui-loading");
}

export function disableSkeleton() {
  document.body.classList.remove("ui-loading");
  document.body.classList.add("ui-ready");
}