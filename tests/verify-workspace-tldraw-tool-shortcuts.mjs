import { execFileSync } from "node:child_process";
import process from "node:process";
import {
  createProjectPrj002BaselineBoard,
  putProjectPrj002Board,
} from "./helpers/workspace-project-prj002-baseline.mjs";
import { startIsolatedWorkspaceServer } from "./helpers/isolated-workspace-server.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwtks_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PROJECT_PATH = "/workspace.html?codex-test-auth=1&workspace-engine=tldraw&project=PRJ-002";

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

async function main() {
  let runtime = null;

  try {
    try {
      runPw(["kill-all"]);
    } catch {}

    runtime = await startIsolatedWorkspaceServer({
      cwd: process.cwd(),
      healthPath: PROJECT_PATH,
    });
    const PROJECT_URL = `http://127.0.0.1:${runtime.port}${PROJECT_PATH}`;

    await putProjectPrj002Board(runtime.port, createProjectPrj002BaselineBoard());
    runPw(["open", PROJECT_URL]);

    const result = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 700));
          const connectButton = document.getElementById("connectNodesBtn");
          const assistantPanel = document.getElementById("workspaceAssistantPanel");
          if (!connectButton || !assistantPanel) {
            return { ok: false, reason: "missing-tooling-ui" };
          }

          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              bubbles: true,
              cancelable: true,
              key: "c",
              code: "KeyC",
            }),
          );
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const afterConnect = {
            toolId: window.__workspaceApp?.currentToolId || null,
            active: connectButton.classList.contains("is-active"),
            pressed: connectButton.getAttribute("aria-pressed"),
            assistantHidden: assistantPanel.hidden,
          };

          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              bubbles: true,
              cancelable: true,
              key: "h",
              code: "KeyH",
            }),
          );
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const afterHand = {
            toolId: window.__workspaceApp?.currentToolId || null,
            active: connectButton.classList.contains("is-active"),
            pressed: connectButton.getAttribute("aria-pressed"),
            assistantHidden: assistantPanel.hidden,
          };

          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              bubbles: true,
              cancelable: true,
              key: "v",
              code: "KeyV",
            }),
          );
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          return {
            ok: true,
            afterConnect,
            afterHand,
            afterSelect: {
              toolId: window.__workspaceApp?.currentToolId || null,
              active: connectButton.classList.contains("is-active"),
              pressed: connectButton.getAttribute("aria-pressed"),
            },
          };
        }`,
      ]),
    );

    if (!result.ok) {
      throw new Error(`Tldraw tool shortcut probe failed: ${result.reason || "unknown reason"}`);
    }

    if (result.afterConnect.toolId !== "arrow") {
      throw new Error(`Pressing C should arm the connect tool. Got ${result.afterConnect.toolId || "<none>"}`);
    }

    if (!result.afterConnect.active || result.afterConnect.pressed !== "true") {
      throw new Error("Pressing C should light up the Connect toolbar button.");
    }

    if (!result.afterConnect.assistantHidden) {
      throw new Error("Pressing C should not open the workspace AI assistant.");
    }

    if (result.afterHand.toolId !== "hand") {
      throw new Error(`Pressing H should switch to the hand tool. Got ${result.afterHand.toolId || "<none>"}`);
    }

    if (result.afterHand.active || result.afterHand.pressed !== "false") {
      throw new Error("Pressing H should clear the Connect toolbar active state.");
    }

    if (!result.afterHand.assistantHidden) {
      throw new Error("Pressing H should not open the workspace AI assistant.");
    }

    if (result.afterSelect.toolId !== "select") {
      throw new Error(`Pressing V should return to select. Got ${result.afterSelect.toolId || "<none>"}`);
    }

    if (result.afterSelect.active || result.afterSelect.pressed !== "false") {
      throw new Error("Pressing V should leave the Connect toolbar button inactive.");
    }

    console.log("PASS: workspace tldraw canvas honors connect/select/hand keyboard shortcuts.");
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

    await runtime?.stop?.();
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
