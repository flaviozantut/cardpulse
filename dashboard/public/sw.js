/**
 * CardPulse Service Worker — offline shell caching.
 *
 * Strategy:
 * - App shell (HTML/JS/CSS): cache on first fetch, serve from cache thereafter.
 * - Navigation requests: network first, fall back to cached /index.html.
 * - API requests (/auth, /v1, /health): network only — never cached here.
 *   (Decrypted data is cached separately in IndexedDB by the app.)
 */

const CACHE_NAME = "cardpulse-shell-v1";

// Minimal shell to pre-cache on install
const SHELL_URLS = ["/", "/index.html"];

// ── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Delete caches from previous versions
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch handling ───────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // API calls: pass through to network — no caching
  if (
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/v1") ||
    url.pathname.startsWith("/health")
  ) {
    return;
  }

  // Navigation requests: network first → cached shell fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a fresh copy of the shell
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Static assets (JS, CSS, fonts, images): cache first → network fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    }),
  );
});
