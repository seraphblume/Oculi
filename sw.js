// Network first, cache as offline fallback, so a deployed update is picked up on the next load.
const CACHE = "oculi-v0.4.0-rc.1-workspace-tabs-1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/vertex.js",
  "./js/config.js",
  "./js/algorithm.js",
  "./js/config-v03.js",
  "./js/engine-v03.js",
  "./js/config-v04.js",
  "./js/engine-v04.js",
  "./js/scoring.js",
  "./js/engines.js",
  "./js/storage.js",
  "./js/ticket-scan.js",
  "./js/app.js",
  "./js/optical-calculators.js",
  "./js/workspace.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match("./index.html")))
  );
});
