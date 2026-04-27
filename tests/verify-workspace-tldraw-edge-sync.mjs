import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import {
  createProjectPrj002BaselineBoard,
  putProjectPrj002Board,
} from "./helpers/workspace-project-prj002-baseline.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwte_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PORT = 4173;
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

    const result = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 700));
          return {
            boardKey: window.__workspaceApp?.boardKey || null,
            ready: window.__workspaceApp?.ready === true,
            edgeCount: window.__workspaceApp?.edgeCount || 0,
            arrowCount: window.__workspaceApp?.arrowCount || 0,
            bindingCount: window.__workspaceApp?.bindingCount || 0,
            shapeCount: window.__workspaceApp?.shapeCount || 0,
          };
        }`,
      ]),
    );

    if (!result.ready || result.boardKey !== "PRJ-002") {
      throw new Error("Tldraw edge sync test expected the project board to be mounted and ready.");
    }

    if (result.edgeCount < 1) {
      throw new Error(`Project board should expose at least one board edge. Got ${result.edgeCount}.`);
    }

    if (result.arrowCount < result.edgeCount) {
      throw new Error(
        `Tldraw project board should materialize board edges as arrow shapes. Edges: ${result.edgeCount} Arrows: ${result.arrowCount}`,
      );
    }

    if (result.bindingCount < result.edgeCount * 2) {
      throw new Error(
        `Tldraw project board should bind arrow terminals to node shapes. Edges: ${result.edgeCount} Bindings: ${result.bindingCount}`,
      );
    }

    if (result.shapeCount < result.edgeCount + 2) {
      throw new Error(
        `Tldraw project board should include arrows in the editor shape count. Shapes: ${result.shapeCount} Edges: ${result.edgeCount}`,
      );
    }

    console.log("PASS: workspace tldraw mode syncs board edges into bound editor arrows.");
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
