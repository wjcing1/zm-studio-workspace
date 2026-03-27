let deferredInstallPrompt = null;
let registrationStarted = false;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export function setupWebApp() {
  const installButton = document.getElementById("installAppBtn");

  if (!registrationStarted && "serviceWorker" in navigator) {
    registrationStarted = true;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
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
