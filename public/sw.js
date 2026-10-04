const CACHE_NAME = "spill-pwa-v1";
// Holds a sync file shared to Spill from another app (Web Share Target).
const SHARE_CACHE = "spill-share-target";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/assets/spill-logo.png",
  "/manifest.json"
];

// Install event: cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate event: cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== SHARE_CACHE).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Share target: a nearby device's sync file was shared to Spill (e.g. after
// arriving over Bluetooth). Park it for the page, which imports it through
// the sync engine's validation.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-target") return;

  event.respondWith((async () => {
    try {
      const form = await event.request.formData();
      const file = form.get("bundle");
      if (file && typeof file !== "string" && file.size <= 2000000) {
        const cache = await caches.open(SHARE_CACHE);
        await cache.put("/__shared-sync-bundle", new Response(file));
      }
    } catch {
      // Ignore malformed shares; the page simply finds nothing to import.
    }
    return Response.redirect("/communities?received=1", 303);
  })());
});

// Fetch event: network first, fallback to cache
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith("http")) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/index.html");
          }
        });
      })
  );
});
