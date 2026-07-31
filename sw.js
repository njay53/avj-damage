/* sw.js — Service Worker
 *
 * Sorgt dafür, dass die App auf dem Hof auch ohne Empfang startet.
 * Die Fahrzeugdaten liegen ohnehin in IndexedDB, nicht hier.
 *
 * Auslieferungsregel: erst das Netz versuchen, aber nur kurz warten. Kommt
 * nichts, wird aus dem Zwischenspeicher geliefert.
 *
 * Vorher war es umgekehrt — erst Zwischenspeicher, Auffrischen im Hintergrund.
 * Das hatte einen bösen Nebeneffekt: nach einer Änderung lief auf dem Gerät
 * neues HTML mit altem JavaScript, weil das HTML über einen anderen Weg geholt
 * wurde als die Skripte. Die App sah dann aus wie die neue Fassung, verhielt
 * sich aber wie die alte. Genau das darf nicht passieren.
 *
 * WICHTIG bei Änderungen am Code: CACHE_VERSION hochzählen.
 */
/* Muss mit APP_VERSION in js/app.js übereinstimmen — die Nummer steht in der
   Fusszeile der App, damit man sieht, welche Fassung ein Gerät geladen hat. */
const CACHE_VERSION = "v17";
const CACHE_NAME = "fahrzeugschaeden-" + CACHE_VERSION;
const NETZ_TIMEOUT = 3000;

const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/store.js",
  "./js/cloud.js",
  "./js/logo.js",
  "./js/pdf.js",
  "./js/annotate.js",
  "./js/fleet.js",
  "./js/uebersicht.js",
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

/* Netz versuchen, aber nicht ewig warten. Ohne Zeitgrenze würde die App bei
   schlechtem Empfang minutenlang hängen, statt die vorhandene Fassung zu
   zeigen. */
function ausDemNetz(req) {
  return new Promise((resolve, reject) => {
    let erledigt = false;
    const uhr = setTimeout(() => {
      if (!erledigt) { erledigt = true; reject(new Error("Zeitüberschreitung")); }
    }, NETZ_TIMEOUT);

    /* cache:"no-store" ist entscheidend: ohne diese Angabe darf der Browser
       die Anfrage aus seinem EIGENEN Zwischenspeicher beantworten, ohne das
       Netz zu fragen. GitHub Pages erlaubt zehn Minuten — Safari hält sich
       auch länger daran. Ergebnis war: neuer Server, altes Programm.
       Der Umweg über die reine Adresse ist nötig, weil eine bestehende
       Anfrage ihre Zwischenspeicher-Einstellung nicht ändern lässt. */
    fetch(req.url, { cache: "no-store", credentials: "same-origin" }).then((res) => {
      if (erledigt) return;
      erledigt = true;
      clearTimeout(uhr);
      if (res && res.ok) {
        const kopie = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, kopie)).catch(() => {});
      }
      resolve(res);
    }).catch((err) => {
      if (erledigt) return;
      erledigt = true;
      clearTimeout(uhr);
      reject(err);
    });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const istNavigation = req.mode === "navigate";

  event.respondWith(
    ausDemNetz(req).catch(() =>
      caches.match(req, { ignoreSearch: true }).then((treffer) => {
        if (treffer) return treffer;
        if (istNavigation) return caches.match("./index.html");
        return new Response("Offline und nicht im Zwischenspeicher", {
          status: 504,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      })
    )
  );
});
