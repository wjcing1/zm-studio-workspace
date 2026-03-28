import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwm_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
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
          const introNode = stage.querySelector('.canvas-node[data-id="intro"]');
          const introRect = introNode.getBoundingClientRect();
          const before = stage.style.transform;
          const start = {
            x: Math.max(introRect.left - 60, viewport.getBoundingClientRect().left + 20),
            y: Math.max(introRect.top - 50, viewport.getBoundingClientRect().top + 20),
          };
          const end = {
            x: Math.min(introRect.right + 16, viewport.getBoundingClientRect().right - 20),
            y: Math.min(introRect.bottom + 16, viewport.getBoundingClientRect().bottom - 20),
          };

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

          fire("pointerdown", start.x, start.y, 1);
          fire("pointermove", end.x, end.y, 1);

          const marqueeWhileDragging = {
            hidden: marquee.hidden,
            width: marquee.style.width,
            height: marquee.style.height,
          };

          fire("pointerup", end.x, end.y, 0);

          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          return {
            before,
            after: stage.style.transform,
            changed: before !== stage.style.transform,
            marqueeWhileDragging,
            selectedIds: [...stage.querySelectorAll(".canvas-node.is-selected")].map((node) => node.dataset.id),
          };
        }`,
      ]),
    );

    if (result.changed) {
      throw new Error(
        `Dragging a blank area should keep the camera stable for marquee selection. Before: ${result.before} After: ${result.after}`,
      );
    }

    if (result.marqueeWhileDragging.hidden) {
      throw new Error("Dragging a blank area should show the marquee selection box while selecting.");
    }

    if (!result.selectedIds.includes("intro")) {
      throw new Error(`Dragging a blank area across the intro node should select it. Selected: ${result.selectedIds.join(", ")}`);
    }

    console.log("PASS: dragging a blank canvas area creates a marquee selection.");
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
