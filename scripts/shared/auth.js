(function () {
  const AUTH_STORAGE_KEY = "zm-studio-auth-session";
  const AUTH_BYPASS_PARAM = "codex-test-auth";
  const DEFAULT_AFTER_LOGIN_PATH = "./workspace.html";

  function isAllowedDestination(pathname) {
    return /\/(?:workspace|projects|assets)\.html$/u.test(pathname);
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function readSession() {
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;

      const parsed = safeJsonParse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (typeof parsed.username !== "string" || typeof parsed.displayName !== "string") return null;

      return parsed;
    } catch {
      return null;
    }
  }

  function writeSession(session) {
    try {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch {}
    return session;
  }

  function clearSession() {
    try {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {}
  }

  function isBypassEnabled(locationLike = window.location) {
    try {
      return new URLSearchParams(locationLike.search || "").get(AUTH_BYPASS_PARAM) === "1";
    } catch {
      return false;
    }
  }

  function stripBypassParam(search) {
    const params = new URLSearchParams(search || "");
    params.delete(AUTH_BYPASS_PARAM);
    const next = params.toString();
    return next ? `?${next}` : "";
  }

  function fallbackDestination() {
    const fallback = new URL(DEFAULT_AFTER_LOGIN_PATH, window.location.href);
    return `${fallback.pathname}${fallback.search}${fallback.hash}`;
  }

  function sanitizeNext(rawNext) {
    const fallback = fallbackDestination();
    if (typeof rawNext !== "string" || rawNext.trim() === "") {
      return fallback;
    }

    try {
      const url = new URL(rawNext, window.location.href);
      if (url.origin !== window.location.origin || !isAllowedDestination(url.pathname)) {
        return fallback;
      }

      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return fallback;
    }
  }

  function buildCurrentDestination(locationLike = window.location) {
    return `${locationLike.pathname}${stripBypassParam(locationLike.search)}${locationLike.hash || ""}`;
  }

  function buildLoginUrl(next) {
    const loginUrl = new URL("./login.html", window.location.href);
    loginUrl.searchParams.set("next", sanitizeNext(next));
    return `${loginUrl.pathname}${loginUrl.search}${loginUrl.hash}`;
  }

  function getPendingDestination() {
    const next = new URLSearchParams(window.location.search).get("next");
    return sanitizeNext(next);
  }

  function isAuthenticated() {
    return isBypassEnabled() || Boolean(readSession());
  }

  function requireAuth() {
    if (isAuthenticated()) {
      return true;
    }

    window.location.replace(buildLoginUrl(buildCurrentDestination()));
    return false;
  }

  function redirectAuthenticatedUser() {
    if (isBypassEnabled() || !readSession()) {
      return false;
    }

    window.location.replace(getPendingDestination());
    return true;
  }

  function login(username, password) {
    const normalizedUsername = typeof username === "string" ? username.trim() : "";
    const normalizedPassword = typeof password === "string" ? password.trim() : "";

    if (!normalizedUsername || !normalizedPassword) {
      return {
        ok: false,
        message: "请输入用户名和密码。",
      };
    }

    const session = writeSession({
      username: normalizedUsername,
      displayName: normalizedUsername,
      loginAt: new Date().toISOString(),
    });

    return {
      ok: true,
      session,
    };
  }

  function decorateHrefWithBypass(href) {
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.endsWith(".html")) {
        return href;
      }

      url.searchParams.set(AUTH_BYPASS_PARAM, "1");
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return href;
    }
  }

  function syncPreviewLinks(root = document) {
    if (!isBypassEnabled()) {
      return;
    }

    for (const anchor of root.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        continue;
      }

      anchor.setAttribute("href", decorateHrefWithBypass(href));
    }
  }

  function sessionLabel() {
    if (isBypassEnabled()) {
      return "Preview Access";
    }

    return readSession()?.displayName || "Studio Access";
  }

  function bindSessionUi() {
    syncPreviewLinks();

    for (const label of document.querySelectorAll("[data-auth-session-label]")) {
      label.textContent = sessionLabel();
    }

    for (const button of document.querySelectorAll("[data-auth-logout]")) {
      if (button.dataset.authBound === "1") {
        continue;
      }

      button.dataset.authBound = "1";
      button.addEventListener("click", () => {
        if (!isBypassEnabled()) {
          clearSession();
        }

        window.location.assign(buildLoginUrl(buildCurrentDestination()));
      });
    }
  }

  function attachSessionUi() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindSessionUi, { once: true });
      return;
    }

    bindSessionUi();
  }

  window.ZMAuth = {
    AUTH_BYPASS_PARAM,
    readSession,
    clearSession,
    isBypassEnabled,
    isAuthenticated,
    login,
    requireAuth,
    redirectAuthenticatedUser,
    getPendingDestination,
    buildLoginUrl,
    buildCurrentDestination,
    decorateHrefWithBypass,
    attachSessionUi,
  };

  attachSessionUi();
})();
