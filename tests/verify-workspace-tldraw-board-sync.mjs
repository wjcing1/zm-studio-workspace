import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import {
  createProjectPrj002BaselineBoard,
  putProjectPrj002Board,
} from "./helpers/workspace-project-prj002-baseline.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwtb_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PORT = 4173;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1&workspace-engine=tldraw`;
const PROJECT_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1&workspace-engine=tldraw&project=PRJ-002`;

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

    await putProjectPrj002Board(PORT, createProjectPrj002BaselineBoard());

    runPw(["open", PAGE_URL]);

    const overview = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 600));
          return {
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
      throw new Error("Tldraw board sync test expected the workspace app to mount.");
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
            boardKey: window.__workspaceApp?.boardKey || null,
            nodeCount: window.__workspaceApp?.nodeCount || 0,
            edgeCount: window.__workspaceApp?.edgeCount || 0,
            shapeCount: window.__workspaceApp?.shapeCount || 0,
          };
        }`,
      ]),
    );

    if (project.boardKey !== "PRJ-002") {
      throw new Error(`Project route should sync the project board into tldraw. Got ${project.boardKey || "<none>"}`);
    }

    if (project.nodeCount < 3 || project.edgeCount < 1 || project.shapeCount < project.nodeCount) {
      throw new Error(
        `Project route should expose synced project board metadata. Nodes: ${project.nodeCount} Edges: ${project.edgeCount} Shapes: ${project.shapeCount}`,
      );
    }

    console.log("PASS: workspace tldraw app syncs active board payloads into the editor.");
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
