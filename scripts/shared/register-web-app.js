let deferredInstallPrompt = null;
let registrationStarted = false;

function updateStatus(text) {
  const statusNode = document.getElementById("webAppStatus");
  if (statusNode) {
    statusNode.textContent = text;
  }
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export function setupWebApp() {
  const installButton = document.getElementById("installAppBtn");

  if (!registrationStarted && "serviceWorker" in navigator) {
    registrationStarted = true;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        updateStatus("Web app install unavailable");
      });
    });
  }

  if (isStandalone()) {
    updateStatus("Installed web app");
  } else {
    updateStatus("Public beta access");
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installButton) {
      installButton.hidden = false;
    }
    updateStatus("Install available");
  });

  installButton?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    installButton.hidden = true;
    updateStatus("Install requested");
  });
}
