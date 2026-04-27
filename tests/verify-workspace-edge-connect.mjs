import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const PORT = 4173;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1`;
let session = buildSessionId();

function buildSessionId() {
  return `wwe_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
}

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${session}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20000,
  });
}

function isRetryablePlaywrightError(error) {
  const message = String(error?.stderr || error?.message || error || "");
  return /Session closed|EADDRINUSE|Daemon process exited/.test(message);
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
      await waitForServer(PAGE_URL, 4);
    } catch {
      server = spawn("node", ["server.mjs"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(PORT),
          OPENAI_API_KEY: "",
        },
        stdio: "ignore",
      });

      await waitForServer(PAGE_URL);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        try {
          runPw(["kill-all"]);
        } catch {}

        session = buildSessionId();
        runPw(["open", PAGE_URL]);
        runPw([
          "eval",
          `() => {
            window.localStorage.removeItem("zm-studio-canvas:overview");
            return true;
          }`,
        ]);
        try {
          runPw(["close"]);
        } catch {}

        session = buildSessionId();
        runPw(["open", PAGE_URL]);

        const result = extractJsonResult(
          runPw([
            "eval",
            `async () => {
              const viewport = document.getElementById("canvasViewport");
              const stage = document.getElementById("canvasStage");
              const connections = document.getElementById("canvasConnections");
              const addTextNodeBtn = document.getElementById("addTextNodeBtn");
              const existingIds = new Set([...stage.querySelectorAll(".canvas-node")].map((node) => node.dataset.id));
              const viewportRect = viewport.getBoundingClientRect();
              const targetPoint = {
                x: viewportRect.left + viewportRect.width * 0.72,
                y: viewportRect.top + viewportRect.height * 0.28,
              };
              const sourcePoint = {
                x: targetPoint.x,
                y: Math.min(targetPoint.y + 250, viewportRect.bottom - 90),
              };

              if (!addTextNodeBtn) {
                return { ok: false, reason: "missing-add-text-button" };
              }

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

              const beforeEdges = connections.querySelectorAll("path[data-edge-id]").length;
              firePointer(viewport, "pointermove", targetPoint.x, targetPoint.y, 1, 0);
              addTextNodeBtn.click();
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              const firstCreatedNodeId =
                [...stage.querySelectorAll(".canvas-node")].find((node) => !existingIds.has(node.dataset.id))?.dataset?.id || null;

              firePointer(viewport, "pointermove", sourcePoint.x, sourcePoint.y, 1, 0);
              addTextNodeBtn.click();
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

              const createdNodes = [...stage.querySelectorAll(".canvas-node")].filter((node) => !existingIds.has(node.dataset.id));
              const targetNode = firstCreatedNodeId
                ? stage.querySelector(\`.canvas-node[data-id="\${firstCreatedNodeId}"]\`)
                : null;
              const sourceNode = createdNodes.find((node) => node.dataset.id !== firstCreatedNodeId) || null;
              const hoverPortCount = targetNode?.querySelectorAll("[data-port-node]").length || 0;
              if (!targetNode || !sourceNode) {
                return { ok: false, reason: "failed-to-create-two-test-nodes" };
              }

              const sourcePort = sourceNode.querySelector('[data-port-node][data-side="top"]');
              const sourcePortRect = sourcePort.getBoundingClientRect();
              const targetRect = targetNode.getBoundingClientRect();
              const sourceId = sourceNode.dataset.id;
              const targetId = targetNode.dataset.id;
              const dropPoint = {
                x: targetRect.left + targetRect.width / 2,
                y: targetRect.bottom - 6,
              };

              firePointer(
                sourcePort,
                "pointerdown",
                sourcePortRect.left + sourcePortRect.width / 2,
                sourcePortRect.top + sourcePortRect.height / 2,
                2,
                1,
              );
              firePointer(viewport, "pointermove", dropPoint.x, dropPoint.y, 2, 1);
              firePointer(viewport, "pointerup", dropPoint.x, dropPoint.y, 2, 0);

              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              const storedBoard = JSON.parse(window.localStorage.getItem("zm-studio-canvas:overview") || "null");
              const createdEdge =
                storedBoard?.edges?.find((edge) => edge.from === sourceId && edge.to === targetId) || null;

              return {
                ok: true,
                hoverPortCount,
                beforeEdges,
                afterEdges: connections.querySelectorAll("path[data-edge-id]").length,
                createdEdgeToSide: createdEdge?.toSide || null,
              };
            }`,
          ]),
        );

        if (!result.ok) {
          throw new Error(`Edge connection probe failed: ${result.reason || "unknown reason"}`);
        }

        if (result.hoverPortCount < 4) {
          throw new Error(`Newly created nodes should expose four connection handles. Visible handles: ${result.hoverPortCount}`);
        }

        if (result.afterEdges !== result.beforeEdges + 1) {
          throw new Error(`Connecting two nodes should add one edge. Before: ${result.beforeEdges} After: ${result.afterEdges}`);
        }

        if (result.createdEdgeToSide !== "bottom") {
          throw new Error(
            `Connecting from a node below the target should land on the target's bottom side. Actual side: ${result.createdEdgeToSide || "<none>"}`,
          );
        }

        console.log("PASS: hover reveals handles and edge creation picks a natural landing side.");
        return;
      } catch (error) {
        if (!isRetryablePlaywrightError(error) || attempt === 2) {
          throw error;
        }
      } finally {
        try {
          runPw(["close"]);
        } catch {}

        try {
          runPw(["kill-all"]);
        } catch {}
      }
    }
  } finally {
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
