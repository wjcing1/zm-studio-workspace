let deferredInstallPrompt = null;
let registrationStarted = false;
const LOCAL_SW_RESET_KEY = "zm-studio-local-sw-reset";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isLocalPreview(locationLike = window.location) {
  const hostname = locationLike.hostname || "";
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

async function disableLocalServiceWorkers() {
  let resetRequired = false;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const unregistered = await registration.unregister().catch(() => false);
      resetRequired = resetRequired || Boolean(unregistered);
    }
  } catch {}

  if ("caches" in window) {
    try {
      const cacheKeys = await caches.keys();
      const localShellCaches = cacheKeys.filter((key) => key.startsWith("zm-studio-shell-"));
      if (localShellCaches.length > 0) {
        resetRequired = true;
        await Promise.all(localShellCaches.map((key) => caches.delete(key)));
      }
    } catch {}
  }

  try {
    const alreadyReset = window.sessionStorage.getItem(LOCAL_SW_RESET_KEY) === "1";
    if (resetRequired && !alreadyReset) {
      window.sessionStorage.setItem(LOCAL_SW_RESET_KEY, "1");
      window.location.reload();
      return;
    }

    if (alreadyReset) {
      window.sessionStorage.removeItem(LOCAL_SW_RESET_KEY);
    }
  } catch {}
}

export function setupWebApp() {
  const installButton = document.getElementById("installAppBtn");

  if (!registrationStarted && "serviceWorker" in navigator) {
    registrationStarted = true;
    window.addEventListener("load", () => {
      if (isLocalPreview()) {
        void disableLocalServiceWorkers();
        return;
      }
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  if (!installButton) {
    return;
  }

  if (isStandalone()) {
    installButton.hidden = true;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installButton) {
      installButton.hidden = false;
    }
  });

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    if (choice?.outcome === "accepted") {
      installButton.hidden = true;
    }
  });
}
