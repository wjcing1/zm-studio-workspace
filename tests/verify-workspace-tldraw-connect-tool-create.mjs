import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import {
  createProjectPrj002BaselineBoard,
  putProjectPrj002Board,
} from "./helpers/workspace-project-prj002-baseline.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const PORT = 4173;
const PROJECT_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1&workspace-engine=tldraw&project=PRJ-002`;
let session = buildSessionId();

function buildSessionId() {
  return `wwctc_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
}

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${session}`, ...args], {
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
      await waitForServer(PROJECT_URL, 4);
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

      await waitForServer(PROJECT_URL);
    }

    await putProjectPrj002Board(PORT, createProjectPrj002BaselineBoard());

    runPw(["open", PROJECT_URL]);
    runPw([
      "eval",
      `() => {
        window.localStorage.removeItem("zm-studio-canvas:PRJ-002");
        return true;
      }`,
    ]);
    try {
      runPw(["close"]);
    } catch {}

    session = buildSessionId();
    runPw(["open", PROJECT_URL]);

    const probe = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 700));
          const board = window.__workspaceBoardState;
          const connectButton = document.getElementById("connectNodesBtn");
          if (!connectButton) {
            return { ok: false, reason: "missing-connect-button" };
          }

          const edgeKeys = new Set((board?.edges || []).map((edge) => \`\${edge.from}->\${edge.to}\`));
          let pair = null;

          for (const source of board?.nodes || []) {
            const sourceEl = document.querySelector(\`.workspace-canvas-app [data-workspace-node-id="\${source.id}"]\`);
            if (!sourceEl) continue;
            const sourceRect = sourceEl.getBoundingClientRect();
            const sourceCenterX = Math.round(sourceRect.left + sourceRect.width / 2);
            const sourceCenterY = Math.round(sourceRect.top + sourceRect.height / 2);
            const sourceHit = document.elementFromPoint(sourceCenterX, sourceCenterY);
            const sourceHitNodeId =
              sourceHit?.closest?.("[data-workspace-node-id]")?.getAttribute("data-workspace-node-id") || null;
            if (sourceHitNodeId !== source.id) continue;

            for (const target of board?.nodes || []) {
              if (source.id === target.id) continue;
              if (edgeKeys.has(\`\${source.id}->\${target.id}\`)) continue;

              const targetEl = document.querySelector(\`.workspace-canvas-app [data-workspace-node-id="\${target.id}"]\`);
              if (!targetEl) continue;
              const targetRect = targetEl.getBoundingClientRect();
              const targetCenterX = Math.round(targetRect.left + targetRect.width / 2);
              const targetCenterY = Math.round(targetRect.top + targetRect.height / 2);
              const targetHit = document.elementFromPoint(targetCenterX, targetCenterY);
              const targetHitNodeId =
                targetHit?.closest?.("[data-workspace-node-id]")?.getAttribute("data-workspace-node-id") || null;
              if (targetHitNodeId !== target.id) continue;

              pair = { sourceId: source.id, targetId: target.id };
              break;
            }

            if (pair) break;
          }

          if (!pair) {
            return { ok: false, reason: "no-node-pair" };
          }

          connectButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const sourceEl = document.querySelector(\`.workspace-canvas-app [data-workspace-node-id="\${pair.sourceId}"]\`);
          const targetEl = document.querySelector(\`.workspace-canvas-app [data-workspace-node-id="\${pair.targetId}"]\`);
          if (!sourceEl || !targetEl) {
            return { ok: false, reason: "missing-source-or-target", pair };
          }

          const sourceRect = sourceEl.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();
          const startX = Math.round(sourceRect.left + sourceRect.width / 2);
          const startY = Math.round(sourceRect.top + sourceRect.height / 2);
          const startHit = document.elementFromPoint(startX, startY);
          return {
            ok: true,
            pair,
            beforeEdgeCount: board?.edges?.length || 0,
            startX,
            startY,
            endX: Math.round(targetRect.left + targetRect.width / 2),
            endY: Math.round(targetRect.top + targetRect.height / 2),
            startHit: startHit
              ? {
                  tag: startHit.tagName,
                  className: startHit.className || "",
                  nodeId: startHit.closest("[data-workspace-node-id]")?.getAttribute("data-workspace-node-id") || null,
                }
              : null,
          };
        }`,
      ]),
    );

    if (!probe.ok) {
      throw new Error(`Connect tool edge create setup failed: ${probe.reason || "unknown reason"}`);
    }

    runPw(["mousemove", String(probe.startX), String(probe.startY)]);
    runPw(["mousedown"]);
    runPw(["mousemove", String(probe.endX), String(probe.endY)]);
    runPw(["mouseup"]);

    const result = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 300));
          const nextBoard = window.__workspaceBoardState;
          const pair = ${JSON.stringify(probe.pair)};
          const createdEdge = nextBoard?.edges?.find((edge) => edge.from === pair.sourceId && edge.to === pair.targetId) || null;

          return {
            afterEdgeCount: nextBoard?.edges?.length || 0,
            createdEdgeId: createdEdge?.id || null,
            currentToolId: window.__workspaceApp?.currentToolId || null,
            arrowCount: window.__workspaceApp?.arrowCount || 0,
            bindingCount: window.__workspaceApp?.bindingCount || 0,
          };
        }`,
      ]),
    );

    if (result.afterEdgeCount !== probe.beforeEdgeCount + 1) {
      throw new Error(
        `Dragging with the Connect tool should create one new edge. Before: ${probe.beforeEdgeCount} After: ${result.afterEdgeCount} Arrows: ${result.arrowCount} Bindings: ${result.bindingCount} Hit: ${JSON.stringify(probe.startHit)}`,
      );
    }

    if (!result.createdEdgeId) {
      throw new Error(
        `Dragging with the Connect tool should persist a bound edge. Pair: ${probe.pair?.sourceId} -> ${probe.pair?.targetId}`,
      );
    }

    if (result.currentToolId !== "arrow") {
      throw new Error(`Creating an edge with the Connect tool should leave the tool armed. Got ${result.currentToolId || "<none>"}`);
    }

    console.log("PASS: workspace tldraw Connect tool creates new edges directly from card drag gestures.");
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
