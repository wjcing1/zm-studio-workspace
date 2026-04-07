import { execFileSync } from "node:child_process";
import process from "node:process";
import {
  createProjectPrj002BaselineBoard,
  putProjectPrj002Board,
} from "./helpers/workspace-project-prj002-baseline.mjs";
import { startIsolatedWorkspaceServer } from "./helpers/isolated-workspace-server.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwtb2_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
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
            return { ok: false, reason: "missing-connect-tool-ui" };
          }

          connectButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const toolAfterConnect = window.__workspaceApp?.currentToolId || null;
          const activeAfterConnect = connectButton.classList.contains("is-active");
          const pressedAfterConnect = connectButton.getAttribute("aria-pressed");

          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              bubbles: true,
              cancelable: true,
              key: " ",
              code: "Space",
            }),
          );

          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const toolWhileHoldingSpace = window.__workspaceApp?.currentToolId || null;
          const assistantHiddenWhileHoldingSpace = assistantPanel.hidden;

          window.dispatchEvent(
            new KeyboardEvent("keyup", {
              bubbles: true,
              cancelable: true,
              key: " ",
              code: "Space",
            }),
          );

          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const toolAfterSpaceRelease = window.__workspaceApp?.currentToolId || null;

          connectButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          return {
            ok: true,
            toolAfterConnect,
            activeAfterConnect,
            pressedAfterConnect,
            toolWhileHoldingSpace,
            assistantHiddenWhileHoldingSpace,
            toolAfterSpaceRelease,
            toolAfterToggleOff: window.__workspaceApp?.currentToolId || null,
            activeAfterToggleOff: connectButton.classList.contains("is-active"),
            pressedAfterToggleOff: connectButton.getAttribute("aria-pressed"),
          };
        }`,
      ]),
    );

    if (!result.ok) {
      throw new Error(`Tldraw tool bridge probe failed: ${result.reason || "unknown reason"}`);
    }

    if (result.toolAfterConnect !== "arrow") {
      throw new Error(`Connect toolbar button should arm the arrow tool. Got ${result.toolAfterConnect || "<none>"}`);
    }

    if (!result.activeAfterConnect || result.pressedAfterConnect !== "true") {
      throw new Error("Connect toolbar button should reflect its active arrow-tool state.");
    }

    if (result.toolWhileHoldingSpace !== "hand") {
      throw new Error(`Holding Space in tldraw mode should temporarily switch to the hand tool. Got ${result.toolWhileHoldingSpace || "<none>"}`);
    }

    if (!result.assistantHiddenWhileHoldingSpace) {
      throw new Error("Holding Space in tldraw mode should not open the workspace AI assistant.");
    }

    if (result.toolAfterSpaceRelease !== "arrow") {
      throw new Error(`Releasing Space should restore the previously armed arrow tool. Got ${result.toolAfterSpaceRelease || "<none>"}`);
    }

    if (result.toolAfterToggleOff !== "select") {
      throw new Error(`Clicking the connect toolbar button again should return to select. Got ${result.toolAfterToggleOff || "<none>"}`);
    }

    if (result.activeAfterToggleOff || result.pressedAfterToggleOff !== "false") {
      throw new Error("Connect toolbar button should clear its active state when toggled off.");
    }

    console.log("PASS: workspace tldraw toolbar bridges connect and temporary hand tools like a canvas editor.");
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
