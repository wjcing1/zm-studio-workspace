import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwt_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PORT = 4173;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html`;

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

    const result = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          const viewport = document.getElementById("canvasViewport");
          const stage = document.getElementById("canvasStage");
          const rect = viewport.getBoundingClientRect();
          const focusPoint = {
            x: Math.round(rect.left + rect.width * 0.72),
            y: Math.round(rect.top + rect.height * 0.62),
          };

          function parseTransform(value) {
            const match = value.match(/translate\\(([-\\d.]+)px,\\s*([-\\d.]+)px\\) scale\\(([-\\d.]+)\\)/);
            if (!match) {
              throw new Error("Unable to parse canvas transform.");
            }
            return {
              x: Number(match[1]),
              y: Number(match[2]),
              z: Number(match[3]),
            };
          }

          function flush() {
            return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }

          function fireWheel(options) {
            viewport.dispatchEvent(
              new WheelEvent("wheel", {
                bubbles: true,
                cancelable: true,
                clientX: focusPoint.x,
                clientY: focusPoint.y,
                ...options,
              }),
            );
          }

          function fireTouch(type, x, y, pointerId, buttons = type === "pointerup" ? 0 : 1) {
            viewport.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                pointerId,
                pointerType: "touch",
                button: 0,
                buttons,
              }),
            );
          }

          const before = parseTransform(stage.style.transform);

          fireWheel({ deltaX: 96, deltaY: 72 });
          await flush();
          const afterWheelPan = parseTransform(stage.style.transform);

          fireWheel({ deltaY: -140, ctrlKey: true });
          await flush();
          const afterWheelPinch = parseTransform(stage.style.transform);

          fireTouch("pointerdown", focusPoint.x - 60, focusPoint.y - 20, 11);
          fireTouch("pointerdown", focusPoint.x + 60, focusPoint.y + 24, 12);
          fireTouch("pointermove", focusPoint.x - 110, focusPoint.y - 34, 11);
          fireTouch("pointermove", focusPoint.x + 118, focusPoint.y + 38, 12);
          fireTouch("pointerup", focusPoint.x - 110, focusPoint.y - 34, 11, 0);
          fireTouch("pointerup", focusPoint.x + 118, focusPoint.y + 38, 12, 0);
          await flush();
          const afterTouchGesture = parseTransform(stage.style.transform);

          return {
            before,
            afterWheelPan,
            afterWheelPinch,
            afterTouchGesture,
          };
        }`,
      ]),
    );

    const wheelPanMovedCamera =
      result.afterWheelPan.x !== result.before.x || result.afterWheelPan.y !== result.before.y;
    const wheelPanPreservedZoom = Math.abs(result.afterWheelPan.z - result.before.z) < 0.0001;
    const wheelPinchChangedZoom = Math.abs(result.afterWheelPinch.z - result.afterWheelPan.z) > 0.0001;
    const touchGestureChangedZoom = Math.abs(result.afterTouchGesture.z - result.afterWheelPinch.z) > 0.0001;

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

    if (!touchGestureChangedZoom) {
      throw new Error(
        `Two-touch pointer gestures should change zoom. After wheel pinch: ${JSON.stringify(result.afterWheelPinch)} After touch: ${JSON.stringify(result.afterTouchGesture)}`,
      );
    }

    console.log("PASS: two-finger gestures pan and zoom the workspace canvas.");
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
