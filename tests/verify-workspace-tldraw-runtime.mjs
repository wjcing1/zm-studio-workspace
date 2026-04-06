import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwr_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PORT = 4173;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1`;

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
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return {
            hasDebugApp: Boolean(window.__workspaceApp),
            engine: window.__workspaceApp?.engine || null,
            ready: window.__workspaceApp?.ready === true,
            hasTldrawMount: Boolean(document.querySelector(".tl-canvas, .tl-container, [data-workspace-engine='tldraw']")),
            hasToolbar: Boolean(document.getElementById("canvasToolbar")),
            hasAssistantPanel: Boolean(document.getElementById("workspaceAssistantPanel")),
          };
        }`,
      ]),
    );

    if (!result.hasDebugApp) {
      throw new Error("Workspace page should expose a debug app handle after mounting the new editor.");
    }

    if (result.engine !== "tldraw") {
      throw new Error(`Workspace app should report the tldraw engine. Actual: ${result.engine || "<none>"}`);
    }

    if (!result.ready) {
      throw new Error("Workspace app should report itself as ready after mounting.");
    }

    if (!result.hasTldrawMount) {
      throw new Error("Workspace page should mount a tldraw editor surface.");
    }

    if (!result.hasToolbar || !result.hasAssistantPanel) {
      throw new Error("Workspace page should preserve the existing toolbar and assistant shell markers.");
    }

    console.log("PASS: workspace runtime is mounted on the tldraw engine.");
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
