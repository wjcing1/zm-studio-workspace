const CACHE_NAME = "zm-studio-shell-v4";
const ASSETS_VERSION = "2026-03-27-nav-1";
const WORKSPACE_VERSION = "2026-03-28-workspace-copilot-1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/开屏动画.html",
  "/workspace.html",
  "/projects.html",
  "/assets.html",
  "/222.html",
  `/styles/shared.css?v=${ASSETS_VERSION}`,
  `/styles/assets.css?v=${ASSETS_VERSION}`,
  `/styles/workspace.css?v=${WORKSPACE_VERSION}`,
  "/styles/projects.css",
  "/styles/splash.css",
  "/scripts/shared/studio-data-client.js",
  "/scripts/shared/workspace-board.js",
  "/scripts/shared/register-web-app.js",
  `/scripts/workspace-page.js?v=${WORKSPACE_VERSION}`,
  "/scripts/projects-page.js",
  `/scripts/assets-page.js?v=${ASSETS_VERSION}`,
  "/splash.js",
  "/studio-data.mjs",
  "/manifest.webmanifest",
  "/icons/app-icon.svg"
];

function isRefreshSensitiveShellAsset(request, url) {
  return (
    request.mode === "navigate" ||
    request.destination === "script" ||
    request.destination === "style" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".mjs") ||
    url.pathname.endsWith(".css")
  );
}

async function cacheResponse(request, response) {
  if (!response || !response.ok) {
    return response;
  }

  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request);
    return cacheResponse(request, response);
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    return fallback ? caches.match(fallback) : Response.error();
  }
}

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

  if (isRefreshSensitiveShellAsset(request, url)) {
    event.respondWith(networkFirst(request, request.mode === "navigate" ? "/workspace.html" : null));
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
