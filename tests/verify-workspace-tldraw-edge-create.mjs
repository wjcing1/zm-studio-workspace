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
  return `wwtc_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
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
          OPENAI_API_KEY: "",
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

    const result = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 700));
          const board = window.__workspaceBoardState;
          const edgeKeys = new Set((board?.edges || []).map((edge) => \`\${edge.from}->\${edge.to}\`));
          const byId = new Map((board?.nodes || []).map((node) => [node.id, node]));
          let pair = null;

          for (const source of board?.nodes || []) {
            const sourceEl = document.querySelector(\`.workspace-canvas-app [data-workspace-node-id="\${source.id}"]\`);
            if (!sourceEl) continue;

            for (const target of board?.nodes || []) {
              if (source.id === target.id) continue;
              if (edgeKeys.has(\`\${source.id}->\${target.id}\`)) continue;

              const targetEl = document.querySelector(\`.workspace-canvas-app [data-workspace-node-id="\${target.id}"]\`);
              if (!targetEl) continue;

              const deltaX = (target.x + target.w / 2) - (source.x + source.w / 2);
              const deltaY = (target.y + (target.autoHeight || target.h || 180) / 2) - (source.y + (source.autoHeight || source.h || 180) / 2);
              const side =
                Math.abs(deltaX) >= Math.abs(deltaY)
                  ? deltaX >= 0
                    ? "right"
                    : "left"
                  : deltaY >= 0
                    ? "bottom"
                    : "top";

              pair = { sourceId: source.id, targetId: target.id, side };
              break;
            }

            if (pair) break;
          }

          if (!pair) {
            return { ok: false, reason: "no-node-pair" };
          }

          const sourcePort = document.querySelector(
            \`.workspace-canvas-app [data-workspace-node-id="\${pair.sourceId}"] .node-port[data-side="\${pair.side}"]\`,
          );
          const targetEl = document.querySelector(\`.workspace-canvas-app [data-workspace-node-id="\${pair.targetId}"]\`);
          if (!sourcePort || !targetEl) {
            return { ok: false, reason: "missing-port-or-target", pair };
          }

          const sourceRect = sourcePort.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();
          const pointerId = 7;
          sourcePort.dispatchEvent(
            new PointerEvent("pointerdown", {
              bubbles: true,
              cancelable: true,
              pointerId,
              clientX: sourceRect.left + sourceRect.width / 2,
              clientY: sourceRect.top + sourceRect.height / 2,
            }),
          );
          window.dispatchEvent(
            new PointerEvent("pointermove", {
              bubbles: true,
              pointerId,
              clientX: targetRect.left + targetRect.width / 2,
              clientY: targetRect.top + targetRect.height / 2,
            }),
          );
          window.dispatchEvent(
            new PointerEvent("pointerup", {
              bubbles: true,
              pointerId,
              clientX: targetRect.left + targetRect.width / 2,
              clientY: targetRect.top + targetRect.height / 2,
            }),
          );

          await new Promise((resolve) => setTimeout(resolve, 250));

          const nextBoard = window.__workspaceBoardState;
          const createdEdge = nextBoard?.edges?.find((edge) => edge.from === pair.sourceId && edge.to === pair.targetId) || null;

          return {
            ok: true,
            pair,
            beforeEdgeCount: board?.edges?.length || 0,
            afterEdgeCount: nextBoard?.edges?.length || 0,
            createdEdgeId: createdEdge?.id || null,
            arrowCount: window.__workspaceApp?.arrowCount || 0,
          };
        }`,
      ]),
    );

    if (!result.ok) {
      throw new Error(`Tldraw edge create test setup failed: ${result.reason || "unknown reason"}`);
    }

    if (result.afterEdgeCount !== result.beforeEdgeCount + 1) {
      throw new Error(
        `Dragging from a tldraw node port should create one new edge. Before: ${result.beforeEdgeCount} After: ${result.afterEdgeCount}`,
      );
    }

    if (!result.createdEdgeId) {
      throw new Error(
        `Dragging from a tldraw node port should persist the new edge endpoints. Pair: ${result.pair?.sourceId} -> ${result.pair?.targetId}`,
      );
    }

    if (result.arrowCount < result.afterEdgeCount) {
      throw new Error(
        `Newly created tldraw edges should also materialize as editor arrows. Arrows: ${result.arrowCount} Edges: ${result.afterEdgeCount}`,
      );
    }

    console.log("PASS: workspace tldraw node ports create new bound edges through drag interaction.");
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
