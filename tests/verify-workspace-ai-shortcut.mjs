import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const PORT = 4194;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1&workspace-shortcut-test=1`;
let session = buildSessionId();

function buildSessionId() {
  return `wwa_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
}

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${session}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20000,
  });
}

function isRetryablePlaywrightError(error) {
  const message = String(error?.stderr || error?.message || error || "");
  return /Session closed|EADDRINUSE|Daemon process exited/.test(message);
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

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        try {
          runPw(["kill-all"]);
        } catch {}

        session = buildSessionId();
        runPw(["open", PAGE_URL]);

        const result = extractJsonResult(
          runPw([
            "eval",
            `async () => {
              const panel = document.getElementById("workspaceAssistantPanel");
              const input = document.getElementById("assistantInput");

              window.dispatchEvent(
                new KeyboardEvent("keydown", {
                  bubbles: true,
                  cancelable: true,
                  key: " ",
                  code: "Space",
                }),
              );

              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

              return {
                beforeHidden: true,
                afterHidden: panel.hidden,
                activeElementId: document.activeElement?.id || "",
                inputMatchesActive: document.activeElement === input,
              };
            }`,
          ]),
        );

        if (result.afterHidden) {
          throw new Error("Pressing Space should open the workspace AI panel.");
        }

        if (!result.inputMatchesActive || result.activeElementId !== "assistantInput") {
          throw new Error(
            `Pressing Space should focus the AI composer. Active element: ${result.activeElementId || "<none>"}`,
          );
        }

        console.log("PASS: pressing Space opens and focuses the workspace AI assistant.");
        return;
      } catch (error) {
        if (!isRetryablePlaywrightError(error) || attempt === 2) {
          throw error;
        }
      } finally {
        try {
          runPw(["close"]);
        } catch {}

        try {
          runPw(["kill-all"]);
        } catch {}
      }
    }
  } finally {
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
