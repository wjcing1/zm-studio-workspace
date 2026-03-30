import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `login_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PORT = 4177;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html`;
const USERNAME = "alice";
const PASSWORD = "secret-123";

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${SESSION}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  });
}

function extractJsonResult(output) {
  const match = output.match(/### Result\s+([\s\S]*?)\n### Ran Playwright code/);
  if (!match) {
    throw new Error(`Unable to parse Playwright output:\n${output}`);
  }
  return JSON.parse(match[1].trim());
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await wait(250);
  }

  throw new Error(`Server did not become ready at ${url}`);
}

async function main() {
  let server = null;

  try {
    try {
      runPw(["kill-all"]);
    } catch {}

    try {
      await waitForServer(PAGE_URL, 4);
    } catch {
      server = spawn("node", ["server.mjs"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(PORT),
          MINIMAX_API_KEY: "",
        },
        stdio: "ignore",
      });

      await waitForServer(PAGE_URL);
    }

    runPw(["open", PAGE_URL]);

    const loginState = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

          for (let index = 0; index < 30; index += 1) {
            if (window.location.pathname.endsWith("/login.html")) {
              break;
            }
            await wait(150);
          }

          const loginPath = window.location.pathname;
          const nextParam = new URLSearchParams(window.location.search).get("next") || "";
          const username = document.getElementById("loginUsername");
          const password = document.getElementById("loginPassword");
          const form = document.getElementById("loginForm");

          if (!username || !password || !form) {
            return {
              loginPath,
              nextParam,
              finalPath: window.location.pathname,
              hasWorkspace: false,
              sessionLabel: "",
              error: "missing-login-form",
            };
          }

          username.value = ${JSON.stringify(USERNAME)};
          username.dispatchEvent(new Event("input", { bubbles: true }));
          password.value = ${JSON.stringify(PASSWORD)};
          password.dispatchEvent(new Event("input", { bubbles: true }));
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

          return {
            loginPath,
            nextParam,
            submitted: true,
            error: "",
          };
        }`,
      ]),
    );

    if (loginState.error) {
      throw new Error(`Login flow is missing expected UI: ${loginState.error}`);
    }

    if (!loginState.loginPath.endsWith("/login.html")) {
      throw new Error(`Protected workspace route should redirect to login.html first. Got ${loginState.loginPath}`);
    }

    if (!/workspace\.html/.test(loginState.nextParam)) {
      throw new Error(`Login redirect should preserve workspace.html as the next destination. Got ${loginState.nextParam}`);
    }

    const finalState = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

          for (let index = 0; index < 40; index += 1) {
            if (window.location.pathname.endsWith("/workspace.html")) {
              break;
            }
            await wait(150);
          }

          return {
            finalPath: window.location.pathname,
            hasWorkspace: Boolean(document.getElementById("canvasViewport")),
            sessionLabel: document.querySelector("[data-auth-session-label]")?.textContent?.trim() || "",
          };
        }`,
      ]),
    );

    if (!finalState.finalPath.endsWith("/workspace.html")) {
      throw new Error(`Successful login should return to workspace.html. Got ${finalState.finalPath}`);
    }

    if (!finalState.hasWorkspace) {
      throw new Error("Successful login should render the workspace shell.");
    }

    if (!finalState.sessionLabel.includes(USERNAME)) {
      throw new Error(`Successful login should keep the entered username in the session UI. Got ${finalState.sessionLabel}`);
    }

    console.log("PASS: protected pages redirect through login and recover the workspace after sign-in.");
  } finally {
    try {
      runPw(["close"]);
    } catch {}

    try {
      runPw(["kill-all"]);
    } catch {}

    if (server) {
      server.kill("SIGTERM");
      await wait(300);
      if (server.exitCode === null) {
        server.kill("SIGKILL");
      }
    }
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
