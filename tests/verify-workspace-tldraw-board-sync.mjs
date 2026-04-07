import { execFileSync } from "node:child_process";
import process from "node:process";
import {
  createProjectPrj002BaselineBoard,
  putProjectPrj002Board,
} from "./helpers/workspace-project-prj002-baseline.mjs";
import { startIsolatedWorkspaceServer } from "./helpers/isolated-workspace-server.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwtb_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PAGE_PATH = "/workspace.html?codex-test-auth=1";
const PROJECT_PATH = `${PAGE_PATH}&project=PRJ-002`;
const TLDRAW_PROJECT_PATH = `${PAGE_PATH}&workspace-engine=tldraw&project=PRJ-002`;

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
    const PROJECT_URL = `http://127.0.0.1:${runtime.port}${PROJECT_PATH}`;
    const TLDRAW_PROJECT_URL = `http://127.0.0.1:${runtime.port}${TLDRAW_PROJECT_PATH}`;

    await putProjectPrj002Board(runtime.port, createProjectPrj002BaselineBoard());

    runPw(["open", PAGE_URL]);

    const overview = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 600));
          return {
            routeMode: document.getElementById("canvasViewport")?.dataset?.workspaceMode || null,
            engine: window.__workspaceApp?.engine || null,
            ready: window.__workspaceApp?.ready === true,
            boardKey: window.__workspaceApp?.boardKey || null,
            nodeCount: window.__workspaceApp?.nodeCount || 0,
            edgeCount: window.__workspaceApp?.edgeCount || 0,
            shapeCount: window.__workspaceApp?.shapeCount || 0,
          };
        }`,
      ]),
    );

    if (!overview.ready || overview.engine !== "tldraw") {
      throw new Error("Hybrid board sync test expected the workspace app to mount.");
    }

    if (overview.routeMode !== "hybrid") {
      throw new Error(`Plain workspace route should resolve to hybrid mode before syncing boards. Got ${overview.routeMode || "<none>"}`);
    }

    if (overview.boardKey !== "overview") {
      throw new Error(`Overview route should sync the overview board into tldraw. Got ${overview.boardKey || "<none>"}`);
    }

    if (overview.nodeCount < 3 || overview.shapeCount < overview.nodeCount) {
      throw new Error(
        `Overview route should expose synced board node metadata. Nodes: ${overview.nodeCount} Shapes: ${overview.shapeCount}`,
      );
    }

    extractJsonResult(
      runPw([
        "eval",
        `async () => {
          window.location.assign(${JSON.stringify(PROJECT_URL)});
          return { navigating: true };
        }`,
      ]),
    );
    const project = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 600));
          return {
            routeMode: document.getElementById("canvasViewport")?.dataset?.workspaceMode || null,
            boardKey: window.__workspaceApp?.boardKey || null,
            nodeCount: window.__workspaceApp?.nodeCount || 0,
            edgeCount: window.__workspaceApp?.edgeCount || 0,
            shapeCount: window.__workspaceApp?.shapeCount || 0,
          };
        }`,
      ]),
    );

    if (project.routeMode !== "hybrid") {
      throw new Error(`Default project route should keep the hybrid shell active. Got ${project.routeMode || "<none>"}`);
    }

    if (project.boardKey !== "PRJ-002") {
      throw new Error(`Project route should sync the project board into tldraw. Got ${project.boardKey || "<none>"}`);
    }

    if (project.nodeCount < 3 || project.edgeCount < 1 || project.shapeCount < project.nodeCount) {
      throw new Error(
        `Project route should expose synced project board metadata. Nodes: ${project.nodeCount} Edges: ${project.edgeCount} Shapes: ${project.shapeCount}`,
      );
    }

    extractJsonResult(
      runPw([
        "eval",
        `async () => {
          window.location.assign(${JSON.stringify(TLDRAW_PROJECT_URL)});
          return { navigating: true };
        }`,
      ]),
    );

    const debugRoute = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 600));
          return {
            routeMode: document.getElementById("canvasViewport")?.dataset?.workspaceMode || null,
            boardKey: window.__workspaceApp?.boardKey || null,
            nodeCount: window.__workspaceApp?.nodeCount || 0,
            edgeCount: window.__workspaceApp?.edgeCount || 0,
            shapeCount: window.__workspaceApp?.shapeCount || 0,
          };
        }`,
      ]),
    );

    if (debugRoute.routeMode !== "tldraw") {
      throw new Error(`workspace-engine=tldraw should preserve the focused debug route. Got ${debugRoute.routeMode || "<none>"}`);
    }

    if (debugRoute.boardKey !== "PRJ-002" || debugRoute.nodeCount < 3 || debugRoute.edgeCount < 1 || debugRoute.shapeCount < debugRoute.nodeCount) {
      throw new Error(
        `Focused tldraw route should still sync the project board payload. Got ${JSON.stringify(debugRoute)}`,
      );
    }

    console.log("PASS: workspace tldraw app syncs active board payloads on both the hybrid default route and the focused tldraw route.");
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
