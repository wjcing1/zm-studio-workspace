const CACHE_NAME = "zm-studio-shell-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/开屏动画.html",
  "/workspace.html",
  "/projects.html",
  "/assets.html",
  "/222.html",
  "/styles/shared.css",
  "/styles/workspace.css",
  "/styles/projects.css",
  "/styles/assets.css",
  "/styles/splash.css",
  "/scripts/shared/studio-data-client.js",
  "/scripts/shared/register-web-app.js",
  "/scripts/workspace-page.js",
  "/scripts/projects-page.js",
  "/scripts/assets-page.js",
  "/splash.js",
  "/studio-data.mjs",
  "/manifest.webmanifest",
  "/icons/app-icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(url.pathname);
        return cached || caches.match("/workspace.html");
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, copy);
        });
        return response;
      });
    }),
  );
});
