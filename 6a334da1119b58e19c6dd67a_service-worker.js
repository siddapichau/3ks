/**
 * Service Worker simples para cache do shell da aplicação.
 * Os dados dinâmicos são guardados no localStorage pelo frontend.
 */
// Bump do cache para forçar atualização quando houver ajustes de layout/estilo.
const CACHE_NAME = "fincontrol-pro-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/api.js",
  "./js/auth.js",
  "./js/dashboard.js",
  "./js/charts.js",
  "./js/financeiro.js",
  "./js/pwa.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "https://accounts.google.com/gsi/client",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          const copy = networkResponse.clone();

          if (request.url.startsWith(self.location.origin) || request.url.includes("cdn.jsdelivr.net")) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }

          return networkResponse;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
