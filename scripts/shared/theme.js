(function () {
  var STORAGE_KEY = "zm-theme";
  var DEFAULT_THEME = "dark";
  var THEMES = ["dark", "light"];

  function readStored() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      return THEMES.indexOf(v) === -1 ? null : v;
    } catch (e) {
      return null;
    }
  }

  function persist(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
  }

  function apply(theme) {
    var root = document.documentElement;
    root.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", theme === "light" ? "#f7f7f5" : "#050505");
    }
    syncToggleButtons(theme);
  }

  function syncToggleButtons(theme) {
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    buttons.forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(theme === "light"));
      btn.dataset.theme = theme;
      var label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
    });
  }

  function get() {
    var attr = document.documentElement.getAttribute("data-theme");
    return THEMES.indexOf(attr) === -1 ? DEFAULT_THEME : attr;
  }

  function set(theme) {
    if (THEMES.indexOf(theme) === -1) return;
    apply(theme);
    persist(theme);
    document.dispatchEvent(new CustomEvent("zm-theme-change", { detail: { theme: theme } }));
  }

  function toggle() {
    set(get() === "light" ? "dark" : "light");
  }

  // Apply early to avoid FOUC.
  apply(readStored() || DEFAULT_THEME);

  function bindButtons() {
    syncToggleButtons(get());
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      if (btn.dataset.themeBound === "true") return;
      btn.dataset.themeBound = "true";
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        toggle();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindButtons);
  } else {
    bindButtons();
  }

  // Re-sync if buttons appear later (e.g. dynamic UI).
  var observer = new MutationObserver(function () {
    bindButtons();
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  window.ZMTheme = { get: get, set: set, toggle: toggle };
})();
