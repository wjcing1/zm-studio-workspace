import { execFileSync } from "node:child_process";
import process from "node:process";
import { startIsolatedWorkspaceServer } from "./helpers/isolated-workspace-server.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwm_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PAGE_PATH = "/workspace.html?codex-test-auth=1";

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

    runPw(["open", PAGE_URL]);

    const result = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          const viewport = document.getElementById("canvasViewport");
          const scene =
            document.querySelector(".workspace-canvas-app .tl-canvas") ||
            document.querySelector(".workspace-canvas-app .tl-container");
          const targetNode = document.querySelector(".workspace-canvas-app [data-workspace-node-id]");
          if (!targetNode) {
            return { ok: false, reason: "no-tldraw-node" };
          }
          if (!viewport || !scene) {
            return { ok: false, reason: "no-tldraw-scene" };
          }
          const targetRect = targetNode.getBoundingClientRect();
          const beforeCamera = structuredClone(window.__workspaceBoardState?.camera || null);
          const start = {
            x: Math.max(targetRect.left - 60, viewport.getBoundingClientRect().left + 20),
            y: Math.max(targetRect.top - 50, viewport.getBoundingClientRect().top + 20),
          };
          const end = {
            x: Math.min(targetRect.right + 16, viewport.getBoundingClientRect().right - 20),
            y: Math.min(targetRect.bottom + 16, viewport.getBoundingClientRect().bottom - 20),
          };

          function fire(type, x, y, buttons) {
            scene.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                composed: true,
                clientX: x,
                clientY: y,
                pointerId: 1,
                pointerType: "mouse",
                button: 0,
                buttons,
              }),
            );
          }

          fire("pointerdown", start.x, start.y, 1);
          fire("pointermove", end.x, end.y, 1);
          await new Promise((resolve) => setTimeout(resolve, 120));

          fire("pointerup", end.x, end.y, 0);

          await new Promise((resolve) => setTimeout(resolve, 180));

          return {
            ok: true,
            routeMode: viewport.dataset.workspaceMode || null,
            beforeCamera,
            afterCamera: structuredClone(window.__workspaceBoardState?.camera || null),
            targetId: targetNode.dataset.workspaceNodeId || null,
            selectedIds: [...(window.__workspaceApp?.pageSelectedNodeIds || [])],
          };
        }`,
      ]),
    );

    if (!result.ok) {
      throw new Error(`Pan-drag probe failed: ${result.reason || "unknown reason"}`);
    }

    if (result.routeMode !== "hybrid") {
      throw new Error(`Default workspace route should run marquee interactions through the hybrid shell. Got ${result.routeMode || "<none>"}`);
    }

    const cameraMoved =
      Math.abs((result.afterCamera?.x || 0) - (result.beforeCamera?.x || 0)) > 0.01 ||
      Math.abs((result.afterCamera?.y || 0) - (result.beforeCamera?.y || 0)) > 0.01 ||
      Math.abs((result.afterCamera?.z || 0) - (result.beforeCamera?.z || 0)) > 0.0001;

    if (cameraMoved) {
      throw new Error(
        `Dragging a blank area should keep the tldraw camera stable for marquee selection. Before: ${JSON.stringify(result.beforeCamera)} After: ${JSON.stringify(result.afterCamera)}`,
      );
    }

    if (!result.targetId || !result.selectedIds.includes(result.targetId)) {
      throw new Error(
        `Dragging a blank area across a visible node should select it. Target: ${result.targetId || "<none>"} Selected: ${result.selectedIds.join(", ")}`,
      );
    }

    console.log("PASS: dragging a blank area across the visible tldraw scene marquee-selects a node without moving the camera.");
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
