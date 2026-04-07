import { execFileSync } from "node:child_process";
import process from "node:process";
import { startIsolatedWorkspaceServer } from "./helpers/isolated-workspace-server.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwt_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
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
          if (!viewport || !scene) {
            return { ok: false, reason: "missing-tldraw-scene" };
          }
          const rect = scene.getBoundingClientRect();
          const focusPoint = {
            x: Math.round(rect.left + rect.width * 0.72),
            y: Math.round(rect.top + rect.height * 0.62),
          };
          const readCamera = () => structuredClone(window.__workspaceBoardState?.camera || null);

          function flush() {
            return new Promise((resolve) => setTimeout(resolve, 180));
          }

          function fireWheel(options) {
            scene.dispatchEvent(
              new WheelEvent("wheel", {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: focusPoint.x,
                clientY: focusPoint.y,
                ...options,
              }),
            );
          }

          function fireTouch(type, x, y, pointerId, buttons = type === "pointerup" ? 0 : 1) {
            scene.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: x,
                clientY: y,
                pointerId,
                pointerType: "touch",
                button: 0,
                buttons,
              }),
            );
          }

          const before = readCamera();

          fireWheel({ deltaX: 96, deltaY: 72 });
          await flush();
          const afterWheelPan = readCamera();

          fireWheel({ deltaY: -140, ctrlKey: true });
          await flush();
          const afterWheelPinch = readCamera();

          fireTouch("pointerdown", focusPoint.x - 60, focusPoint.y - 20, 11);
          fireTouch("pointerdown", focusPoint.x + 60, focusPoint.y + 24, 12);
          fireTouch("pointermove", focusPoint.x - 110, focusPoint.y - 34, 11);
          fireTouch("pointermove", focusPoint.x + 118, focusPoint.y + 38, 12);
          fireTouch("pointerup", focusPoint.x - 110, focusPoint.y - 34, 11, 0);
          fireTouch("pointerup", focusPoint.x + 118, focusPoint.y + 38, 12, 0);
          await flush();
          const afterTouchGesture = readCamera();

          return {
            ok: true,
            routeMode: viewport.dataset.workspaceMode || null,
            focusPoint,
            before,
            afterWheelPan,
            afterWheelPinch,
            afterTouchGesture,
          };
        }`,
      ]),
    );

    if (!result.ok) {
      throw new Error(`Touch gesture probe failed: ${result.reason || "unknown reason"}`);
    }

    if (result.routeMode !== "hybrid") {
      throw new Error(`Default workspace route should run visible-scene gestures through the hybrid shell. Got ${result.routeMode || "<none>"}`);
    }

    const wheelPanMovedCamera =
      result.afterWheelPan.x !== result.before.x || result.afterWheelPan.y !== result.before.y;
    const wheelPanPreservedZoom = Math.abs(result.afterWheelPan.z - result.before.z) < 0.0001;
    const wheelPinchChangedZoom = Math.abs(result.afterWheelPinch.z - result.afterWheelPan.z) > 0.0001;

    if (!wheelPanMovedCamera || !wheelPanPreservedZoom) {
      throw new Error(
        `Two-finger scrolling should pan the camera without changing zoom. Before: ${JSON.stringify(result.before)} After pan: ${JSON.stringify(result.afterWheelPan)}`,
      );
    }

    if (!wheelPinchChangedZoom) {
      throw new Error(
        `Pinch-style wheel gestures should change zoom. After pan: ${JSON.stringify(result.afterWheelPan)} After pinch: ${JSON.stringify(result.afterWheelPinch)}`,
      );
    }

    const touchGestureChangedZoom = Math.abs(result.afterTouchGesture.z - result.afterWheelPinch.z) > 0.0001;

    if (!touchGestureChangedZoom) {
      throw new Error(
        `Two-touch pointer gestures should change zoom. After wheel pinch: ${JSON.stringify(result.afterWheelPinch)} After touch: ${JSON.stringify(result.afterTouchGesture)}`,
      );
    }

    console.log("PASS: wheel and touch gestures update the visible tldraw scene camera on the hybrid route.");
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
