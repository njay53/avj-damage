/* sw.js — Service Worker
 *
 * App-Shell wird gecacht, damit die App auf dem Hof auch ohne Empfang startet.
 * Die Fahrzeug- und Protokolldaten liegen ohnehin in IndexedDB, nicht im Cache.
 *
 * WICHTIG bei Änderungen am Code: CACHE_VERSION hochzählen, sonst laden die
 * Geräte weiter die alte Version aus dem Cache.
 */
const CACHE_VERSION = "v8";
const CACHE_NAME = "fahrzeugschaeden-" + CACHE_VERSION;

const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/store.js",
  "./js/cloud.js",
  "./js/annotate.js",
  "./js/fleet.js",
  "./js/snapshot.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/favicon.png",
  "./icons/logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* Navigationsanfragen: erst Netz (damit Updates ankommen), sonst Cache.
     Alles andere: erst Cache (schnell und offline), im Hintergrund auffrischen. */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        fetch(req)
          .then((res) => caches.open(CACHE_NAME).then((c) => c.put(req, res)))
          .catch(() => {});
        return cached;
      }
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      });
    })
  );
});
