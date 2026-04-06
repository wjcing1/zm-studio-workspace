import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import {
  createProjectPrj002BaselineBoard,
  putProjectPrj002Board,
} from "./helpers/workspace-project-prj002-baseline.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwtcc_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PORT = 4173;
const PROJECT_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1&workspace-engine=tldraw&project=PRJ-002`;

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${SESSION}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20000,
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
      await waitForServer(PROJECT_URL, 4);
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

      await waitForServer(PROJECT_URL);
    }

    await putProjectPrj002Board(PORT, createProjectPrj002BaselineBoard());
    runPw(["open", PROJECT_URL]);

    const result = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 700));
          const viewport = document.getElementById("canvasViewport");
          const connectButton = document.getElementById("connectNodesBtn");
          const contextShell = document.querySelector(".canvas-context-shell");
          const contextCopy = document.querySelector(".canvas-context-copy");
          if (!viewport || !connectButton || !contextShell || !contextCopy) {
            return { ok: false, reason: "missing-context-ui" };
          }

          const beforeCollapsed = viewport.classList.contains("is-context-collapsed");
          const beforeHitTag = document.elementFromPoint(
            Math.round(contextCopy.getBoundingClientRect().left + 8),
            Math.round(contextCopy.getBoundingClientRect().top + 8),
          )?.tagName || null;

          connectButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          return {
            ok: true,
            beforeCollapsed,
            afterCollapsed: viewport.classList.contains("is-context-collapsed"),
            toggleHidden: document.getElementById("canvasContextToggle")?.hidden ?? null,
            contextShellAriaHidden: contextShell.getAttribute("aria-hidden"),
            currentToolId: window.__workspaceApp?.currentToolId || null,
            beforeHitTag,
          };
        }`,
      ]),
    );

    if (!result.ok) {
      throw new Error(`Context collapse probe failed: ${result.reason || "unknown reason"}`);
    }

    if (result.beforeCollapsed) {
      throw new Error("Project canvas should begin with the context shell expanded for this regression.");
    }

    if (result.currentToolId !== "arrow") {
      throw new Error(`Connect button should still arm the arrow tool. Got ${result.currentToolId || "<none>"}`);
    }

    if (!result.afterCollapsed) {
      throw new Error("Switching into the Connect tool should collapse the context shell so it stops blocking the canvas.");
    }

    if (result.toggleHidden !== false) {
      throw new Error("Collapsing the context shell should reveal the top-left restore toggle.");
    }

    console.log("PASS: workspace tldraw Connect tool collapses the context shell to unblock canvas interactions.");
  } finally {
    try {
      await putProjectPrj002Board(PORT, createProjectPrj002BaselineBoard());
    } catch {}

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
