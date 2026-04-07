import { execFileSync } from "node:child_process";
import process from "node:process";
import { startIsolatedWorkspaceServer } from "./helpers/isolated-workspace-server.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwchl_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PAGE_PATH = "/workspace.html?codex-test-auth=1";
const COMPAT_PATH = `${PAGE_PATH}&workspace-engine=compat`;

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
    const COMPAT_URL = `http://127.0.0.1:${runtime.port}${COMPAT_PATH}`;

    runPw(["open", PAGE_URL]);

    const hybridResult = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 700));
          const viewport = document.getElementById("canvasViewport");
          const workspaceCanvasApp = document.getElementById("workspaceCanvasApp");
          const canvasStage = document.getElementById("canvasStage");
          const canvasConnections = document.getElementById("canvasConnections");
          if (!viewport || !workspaceCanvasApp) {
            return { ok: false, reason: "missing-workspace-layers" };
          }

          const appStyle = getComputedStyle(workspaceCanvasApp);
          const stageStyle = canvasStage ? getComputedStyle(canvasStage) : null;
          const connectionsStyle = canvasConnections ? getComputedStyle(canvasConnections) : null;

          return {
            ok: true,
            routeMode: viewport.dataset.workspaceMode || null,
            engineAttr: workspaceCanvasApp.dataset.workspaceEngine || null,
            isTldrawPrimary: viewport.classList.contains("is-tldraw-primary"),
            opacity: appStyle.opacity,
            visibility: appStyle.visibility,
            pointerEvents: appStyle.pointerEvents,
            stageOpacity: stageStyle?.opacity || null,
            stagePointerEvents: stageStyle?.pointerEvents || null,
            connectionsOpacity: connectionsStyle?.opacity || null,
            connectionsPointerEvents: connectionsStyle?.pointerEvents || null,
          };
        }`,
      ]),
    );

    if (!hybridResult.ok) {
      throw new Error(`Hybrid workspace probe failed: ${hybridResult.reason || "unknown reason"}`);
    }

    if (hybridResult.routeMode !== "hybrid") {
      throw new Error(`Plain workspace route should resolve to hybrid mode. Got ${hybridResult.routeMode || "<none>"}`);
    }

    if (hybridResult.engineAttr !== "tldraw" || !hybridResult.isTldrawPrimary) {
      throw new Error("Plain workspace route should promote the tldraw scene to the visible primary layer.");
    }

    if (hybridResult.opacity !== "1" || hybridResult.visibility !== "visible" || hybridResult.pointerEvents !== "auto") {
      throw new Error(
        `Hybrid workspace should expose an interactive tldraw layer. Opacity: ${hybridResult.opacity} Visibility: ${hybridResult.visibility} Pointer events: ${hybridResult.pointerEvents}`,
      );
    }

    if (
      hybridResult.stageOpacity !== "0" ||
      hybridResult.stagePointerEvents !== "none" ||
      hybridResult.connectionsOpacity !== "0" ||
      hybridResult.connectionsPointerEvents !== "none"
    ) {
      throw new Error(
        `Hybrid workspace should hide legacy compat scene layers. Stage: ${hybridResult.stageOpacity}/${hybridResult.stagePointerEvents} Connections: ${hybridResult.connectionsOpacity}/${hybridResult.connectionsPointerEvents}`,
      );
    }

    extractJsonResult(
      runPw([
        "eval",
        `async () => {
          window.location.assign(${JSON.stringify(COMPAT_URL)});
          return { navigating: true };
        }`,
      ]),
    );

    const compatResult = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 700));
          const viewport = document.getElementById("canvasViewport");
          const workspaceCanvasApp = document.getElementById("workspaceCanvasApp");
          const canvasStage = document.getElementById("canvasStage");
          const canvasConnections = document.getElementById("canvasConnections");
          if (!viewport || !workspaceCanvasApp) {
            return { ok: false, reason: "missing-workspace-layers" };
          }

          const appStyle = getComputedStyle(workspaceCanvasApp);
          const stageStyle = canvasStage ? getComputedStyle(canvasStage) : null;
          const connectionsStyle = canvasConnections ? getComputedStyle(canvasConnections) : null;

          return {
            ok: true,
            routeMode: viewport.dataset.workspaceMode || null,
            engineAttr: workspaceCanvasApp.dataset.workspaceEngine || null,
            isTldrawPrimary: viewport.classList.contains("is-tldraw-primary"),
            opacity: appStyle.opacity,
            visibility: appStyle.visibility,
            pointerEvents: appStyle.pointerEvents,
            stageOpacity: stageStyle?.opacity || null,
            stagePointerEvents: stageStyle?.pointerEvents || null,
            connectionsOpacity: connectionsStyle?.opacity || null,
            connectionsPointerEvents: connectionsStyle?.pointerEvents || null,
          };
        }`,
      ]),
    );

    if (!compatResult.ok) {
      throw new Error(`Compat workspace probe failed: ${compatResult.reason || "unknown reason"}`);
    }

    if (compatResult.routeMode !== "compat") {
      throw new Error(`workspace-engine=compat should resolve to compat mode. Got ${compatResult.routeMode || "<none>"}`);
    }

    if (compatResult.isTldrawPrimary) {
      throw new Error("Compat fallback should keep the legacy shell renderer in front of the hidden tldraw app.");
    }

    if (compatResult.opacity !== "0" || compatResult.visibility !== "hidden" || compatResult.pointerEvents !== "none") {
      throw new Error(
        `Compat workspace should hide the tldraw layer to avoid double-rendered cards. Opacity: ${compatResult.opacity} Visibility: ${compatResult.visibility} Pointer events: ${compatResult.pointerEvents}`,
      );
    }

    if (
      compatResult.stageOpacity === "0" ||
      compatResult.stagePointerEvents === "none" ||
      compatResult.connectionsOpacity === "0" ||
      compatResult.connectionsPointerEvents === "none"
    ) {
      throw new Error(
        `Compat fallback should keep legacy scene layers active. Stage: ${compatResult.stageOpacity}/${compatResult.stagePointerEvents} Connections: ${compatResult.connectionsOpacity}/${compatResult.connectionsPointerEvents}`,
      );
    }

    console.log("PASS: the plain workspace route uses hybrid tldraw, while workspace-engine=compat preserves the legacy fallback.");
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
