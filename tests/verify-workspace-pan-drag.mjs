import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `verify_workspace_pan_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
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
          const marquee = document.getElementById("marqueeSelection");
          const rect = viewport.getBoundingClientRect();

          function isInteractive(element) {
            return Boolean(
              element?.closest?.(
                ".canvas-node, .canvas-context-shell, #canvasContextToggle, #canvasToolbar, .canvas-hud, #workspaceAssistantPanel, #assistantCompanion",
              ),
            );
          }

          function findBlankPoint() {
            for (let y = Math.round(rect.top + rect.height * 0.45); y < rect.bottom - 40; y += 24) {
              for (let x = Math.round(rect.left + rect.width * 0.55); x < rect.right - 40; x += 24) {
                const element = document.elementFromPoint(x, y);
                if (element && !isInteractive(element)) {
                  return { x, y };
                }
              }
            }

            return {
              x: Math.round(rect.left + rect.width * 0.75),
              y: Math.round(rect.top + rect.height * 0.6),
            };
          }

          const point = findBlankPoint();
          const before = stage.style.transform;

          function fire(type, x, y, buttons) {
            viewport.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                clientX: x,
                clientY: y,
                pointerId: 1,
                pointerType: "mouse",
                button: 0,
                buttons,
              }),
            );
          }

          fire("pointerdown", point.x, point.y, 1);
          fire("pointermove", point.x + 140, point.y + 48, 1);
          fire("pointerup", point.x + 140, point.y + 48, 0);

          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          return {
            before,
            after: stage.style.transform,
            changed: before !== stage.style.transform,
            marqueeVisible: !marquee.hidden,
          };
        }`,
      ]),
    );

    if (!result.changed) {
      throw new Error(
        `Dragging empty canvas should pan the viewport. Before: ${result.before} After: ${result.after}`,
      );
    }

    if (result.marqueeVisible) {
      throw new Error("Dragging empty canvas for panning should not leave the marquee selection visible.");
    }

    console.log("PASS: dragging empty canvas pans the viewport.");
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
