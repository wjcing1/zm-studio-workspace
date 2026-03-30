import { setupWebApp } from "./shared/register-web-app.js?v=2026-03-30-auth-1";

setupWebApp();

const auth = window.ZMAuth;
const usernameInput = document.getElementById("loginUsername");
const passwordInput = document.getElementById("loginPassword");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const loginSubmit = document.getElementById("loginSubmit");
const loginDemoHint = document.getElementById("loginDemoHint");
const nextDestination = document.getElementById("nextDestination");

if (auth && usernameInput && passwordInput && loginForm && loginStatus && loginSubmit && loginDemoHint && nextDestination) {
  if (!auth.redirectAuthenticatedUser()) {
    const demoCredentials = auth.DEMO_CREDENTIALS;

    function destinationLabel(pathname) {
      if (/projects\.html/.test(pathname)) return "Projects";
      if (/assets\.html/.test(pathname)) return "Assets";
      return "Workspace";
    }

    function setStatus(message, tone = "") {
      loginStatus.textContent = message;
      loginStatus.classList.remove("is-error", "is-success");
      if (tone) {
        loginStatus.classList.add(tone);
      }
    }

    nextDestination.textContent = destinationLabel(auth.getPendingDestination());
    loginDemoHint.textContent = `演示账号：${demoCredentials.username} / ${demoCredentials.password}`;
    usernameInput.value = demoCredentials.username;
    passwordInput.value = demoCredentials.password;

    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      loginSubmit.disabled = true;

      const result = auth.login(usernameInput.value, passwordInput.value);

      if (!result.ok) {
        setStatus(result.message, "is-error");
        loginSubmit.disabled = false;
        passwordInput.focus();
        return;
      }

      setStatus("登录成功，正在进入页面…", "is-success");
      window.setTimeout(() => {
        window.location.assign(auth.getPendingDestination());
      }, 160);
    });
  }
}
