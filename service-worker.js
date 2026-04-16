const CACHE_VERSION = "Minaret-V2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

const APP_SHELL = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/app.js",
  "/js/core/app-config.js",
  "/js/core/app-state.js",
  "/js/core/bootstrap.js",
  "/js/core/notifications.js",
  "/js/components/bottom-tabs.js",
  "/js/components/progress-dial.js",
  "/js/components/minaret-prayers-list.js",
  "/js/components/skeleton.js",
  "/js/pages/minaret-daily-page.js",
  "/js/pages/minaret-monthly-page.js",
  "/js/pages/minaret-settings-page.js",
  "/js/utils/storage.js",
  "/js/utils/location.js",
  "/js/utils/language.js",
  "/js/utils/dom.js",
  "/js/utils/ui.js",
  "/js/utils/format.js",
  "/packages/shared/minaret-prayer-engine.js",
  "/packages/shared/minaret-prayer-constants.js",
  "/packages/shared/minaret-prayer-types.js",
  "/packages/shared/time.js",
  "/packages/shared/validation.js",
  "/packages/shared/ids.js",
  "/packages/core/app-config.js",
  "/packages/core/feature-flags.js",
  "/packages/core/ui-tokens.js",
  "/packages/core/state-schema.js",
  "/locales/ar.json",
  "/locales/en.json",
  "/img/icon-180.png",
  "/img/icon-192.png",
  "/img/icon-512.png",
  "/img/icon-512-maskable.png",
  "/img/startup-1290x2796.png",
  "/favicon.ico"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const expectedCaches = new Set([SHELL_CACHE, RUNTIME_CACHE, IMAGE_CACHE]);
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter((key) => !expectedCaches.has(key))
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // تجاهل أي شيء خارج نفس الأصل
  if (url.origin !== self.location.origin) return;

  // لا نتدخل في هذه الملفات حتى لا نعقد تحديثاتها
  if (
    url.pathname.endsWith("/manifest.json") ||
    url.pathname.includes("startup-image") ||
    url.pathname.includes("apple-touch")
  ) {
    return;
  }

  // HTML / Navigation => Network first
  if (
    event.request.mode === "navigate" ||
    event.request.destination === "document" ||
    url.pathname.endsWith(".html")
  ) {
    event.respondWith(networkFirst(event.request, SHELL_CACHE, "/index.html"));
    return;
  }

  // صور وأيقونات => Cache first
  if (event.request.destination === "image") {
    event.respondWith(cacheFirst(event.request, IMAGE_CACHE));
    return;
  }

  // CSS / JS / JSON / fonts => Stale while revalidate
  if (
    event.request.destination === "script" ||
    event.request.destination === "style" ||
    event.request.destination === "font" ||
    url.pathname.endsWith(".json")
  ) {
    event.respondWith(staleWhileRevalidate(event.request, RUNTIME_CACHE));
    return;
  }

  // fallback عام
  event.respondWith(networkFirst(event.request, RUNTIME_CACHE));
});

self.addEventListener("push", (event) => {
  const payload = normalizeNotificationPayload(event);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      renotify: payload.renotify,
      requireInteraction: payload.requireInteraction,
      lang: payload.lang,
      icon: payload.icon,
      badge: payload.badge,
      data: payload.data
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        const clientUrl = new URL(client.url);
        const desiredUrl = new URL(targetUrl, self.location.origin);

        if (clientUrl.pathname === desiredUrl.pathname && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

function normalizeNotificationPayload(event) {
  const fallback = {
    title: "Minaret",
    body: "Prayer reminder",
    tag: "minaret-prayer-reminder",
    renotify: false,
    requireInteraction: false,
    lang: "en",
    icon: "/img/icon-192.png",
    badge: "/img/icon-180.png",
    data: {
      url: "/"
    }
  };

  try {
    const raw = event.data ? event.data.json() : {};
    return {
      title: raw?.title || fallback.title,
      body: raw?.body || raw?.options?.body || fallback.body,
      tag: raw?.tag || raw?.options?.tag || fallback.tag,
      renotify: raw?.renotify ?? raw?.options?.renotify ?? fallback.renotify,
      requireInteraction:
        raw?.requireInteraction ??
        raw?.options?.requireInteraction ??
        fallback.requireInteraction,
      lang: raw?.lang || raw?.options?.lang || fallback.lang,
      icon: raw?.icon || raw?.options?.icon || fallback.icon,
      badge: raw?.badge || raw?.options?.badge || fallback.badge,
      data: {
        ...(raw?.options?.data || {}),
        ...(raw?.data || {}),
        url:
          raw?.url ||
          raw?.options?.url ||
          raw?.options?.data?.url ||
          raw?.data?.url ||
          fallback.data.url
      }
    };
  } catch {
    return fallback;
  }
}

async function networkFirst(request, cacheName, fallbackUrl = null) {
  const cache = await caches.open(cacheName);

  try {
    const fresh = await fetch(request);

    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }

    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }

    throw new Error("Network request failed and no cache available.");
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const fresh = await fetch(request);
  if (fresh && fresh.ok) {
    cache.put(request, fresh.clone());
  }
  return fresh;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.ok) {
        cache.put(request, fresh.clone());
      }
      return fresh;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const fresh = await networkPromise;
  if (fresh) return fresh;

  throw new Error("Request failed and no cache available.");
}
