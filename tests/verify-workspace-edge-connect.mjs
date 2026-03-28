import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwe_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
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
          const connections = document.getElementById("canvasConnections");
          const initialProjectNode = stage.querySelector('.canvas-node[data-id="overview-PRJ-001"]');
          const projectRect = initialProjectNode.getBoundingClientRect();
          const spawnPoint = {
            x: Math.max(projectRect.left - 220, viewport.getBoundingClientRect().left + 40),
            y: Math.min(projectRect.bottom + 120, viewport.getBoundingClientRect().bottom - 60),
          };

          function firePointer(target, type, x, y, pointerId, buttons) {
            target.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                pointerId,
                pointerType: "mouse",
                button: 0,
                buttons,
              }),
            );
          }

          function fireDoubleClick(x, y) {
            viewport.dispatchEvent(
              new MouseEvent("dblclick", {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
              }),
            );
          }

          const beforeEdges = connections.querySelectorAll("path[data-edge-id]").length;
          fireDoubleClick(spawnPoint.x, spawnPoint.y);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const sourceNode = [...stage.querySelectorAll(".canvas-node")].at(-1);
          const sourceRect = sourceNode.getBoundingClientRect();

          firePointer(sourceNode, "pointerdown", sourceRect.left + sourceRect.width / 2, sourceRect.top + 18, 1, 1);
          firePointer(viewport, "pointerup", sourceRect.left + sourceRect.width / 2, sourceRect.top + 18, 1, 0);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const freshSourceNode = [...stage.querySelectorAll(".canvas-node")].at(-1);
          const sourcePort = freshSourceNode.querySelector('[data-port-node][data-side="right"]');
          const sourcePortRect = sourcePort.getBoundingClientRect();
          const targetNode = stage.querySelector('.canvas-node[data-id="overview-PRJ-001"]');
          const targetRect = targetNode.getBoundingClientRect();

          firePointer(
            sourcePort,
            "pointerdown",
            sourcePortRect.left + sourcePortRect.width / 2,
            sourcePortRect.top + sourcePortRect.height / 2,
            2,
            1,
          );
          firePointer(viewport, "pointermove", targetRect.left + targetRect.width / 2, targetRect.top + targetRect.height / 2, 2, 1);
          firePointer(viewport, "pointerup", targetRect.left + targetRect.width / 2, targetRect.top + targetRect.height / 2, 2, 0);

          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          return {
            beforeEdges,
            afterEdges: connections.querySelectorAll("path[data-edge-id]").length,
          };
        }`,
      ]),
    );

    if (result.afterEdges !== result.beforeEdges + 1) {
      throw new Error(`Connecting two nodes should add one edge. Before: ${result.beforeEdges} After: ${result.afterEdges}`);
    }

    console.log("PASS: dragging from one node port to another creates an edge.");
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
