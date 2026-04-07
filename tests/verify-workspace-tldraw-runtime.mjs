import { execFileSync } from "node:child_process";
import process from "node:process";
import { startIsolatedWorkspaceServer } from "./helpers/isolated-workspace-server.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwr_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PAGE_PATH = "/workspace.html?codex-test-auth=1";
const TLDRAW_PATH = `${PAGE_PATH}&workspace-engine=tldraw`;

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
      healthPath: PAGE_PATH,
    });
    const PAGE_URL = `http://127.0.0.1:${runtime.port}${PAGE_PATH}`;
    const TLDRAW_URL = `http://127.0.0.1:${runtime.port}${TLDRAW_PATH}`;

    runPw(["open", PAGE_URL]);

    const hybridResult = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const viewport = document.getElementById("canvasViewport");
          const workspaceCanvasApp = document.getElementById("workspaceCanvasApp");
          return {
            routeMode: viewport?.dataset?.workspaceMode || null,
            hasDebugApp: Boolean(window.__workspaceApp),
            engine: window.__workspaceApp?.engine || null,
            ready: window.__workspaceApp?.ready === true,
            engineAttr: workspaceCanvasApp?.dataset?.workspaceEngine || null,
            clipboardMode: window.__workspaceClipboardMode || null,
            hasTldrawMount: Boolean(document.querySelector(".tl-canvas, .tl-container, [data-workspace-engine='tldraw']")),
            hasToolbar: Boolean(document.getElementById("canvasToolbar")),
            hasAssistantPanel: Boolean(document.getElementById("workspaceAssistantPanel")),
          };
        }`,
      ]),
    );

    if (!hybridResult.hasDebugApp) {
      throw new Error("Workspace page should expose a debug app handle after mounting the new editor.");
    }

    if (hybridResult.routeMode !== "hybrid") {
      throw new Error(`Plain workspace route should mount in hybrid mode. Got ${hybridResult.routeMode || "<none>"}`);
    }

    if (hybridResult.engine !== "tldraw" || hybridResult.engineAttr !== "tldraw") {
      throw new Error(`Workspace app should report the tldraw engine on the hybrid route. Actual: ${hybridResult.engine || "<none>"} Attr: ${hybridResult.engineAttr || "<none>"}`);
    }

    if (!hybridResult.ready) {
      throw new Error("Workspace app should report itself as ready after mounting.");
    }

    if (hybridResult.clipboardMode !== "tldraw") {
      throw new Error(`Hybrid mode should delegate clipboard ownership to tldraw. Got ${hybridResult.clipboardMode || "<none>"}`);
    }

    if (!hybridResult.hasTldrawMount) {
      throw new Error("Workspace page should mount a tldraw editor surface.");
    }

    if (!hybridResult.hasToolbar || !hybridResult.hasAssistantPanel) {
      throw new Error("Workspace page should preserve the existing toolbar and assistant shell markers.");
    }

    extractJsonResult(
      runPw([
        "eval",
        `async () => {
          window.location.assign(${JSON.stringify(TLDRAW_URL)});
          return { navigating: true };
        }`,
      ]),
    );

    const debugResult = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const viewport = document.getElementById("canvasViewport");
          const workspaceCanvasApp = document.getElementById("workspaceCanvasApp");
          return {
            routeMode: viewport?.dataset?.workspaceMode || null,
            engine: window.__workspaceApp?.engine || null,
            ready: window.__workspaceApp?.ready === true,
            engineAttr: workspaceCanvasApp?.dataset?.workspaceEngine || null,
            hasTldrawMount: Boolean(document.querySelector(".tl-canvas, .tl-container, [data-workspace-engine='tldraw']")),
          };
        }`,
      ]),
    );

    if (debugResult.routeMode !== "tldraw") {
      throw new Error(`workspace-engine=tldraw should resolve to the focused tldraw route. Got ${debugResult.routeMode || "<none>"}`);
    }

    if (debugResult.engine !== "tldraw" || debugResult.engineAttr !== "tldraw" || !debugResult.ready || !debugResult.hasTldrawMount) {
      throw new Error("workspace-engine=tldraw should keep the standalone tldraw runtime available for focused testing.");
    }

    console.log("PASS: workspace runtime mounts tldraw for both the hybrid default route and the focused tldraw route.");
  } finally {
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
