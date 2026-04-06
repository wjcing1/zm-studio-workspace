import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import {
  createProjectPrj002BaselineBoard,
  putProjectPrj002Board,
} from "./helpers/workspace-project-prj002-baseline.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwtrc_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PORT = 4173;
const PROJECT_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1&workspace-engine=tldraw&project=PRJ-002`;
const MODIFIER_KEY = process.platform === "darwin" ? "Meta" : "Control";

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
          MINIMAX_API_KEY: "",
        },
        stdio: "ignore",
      });

      await waitForServer(PROJECT_URL);
    }

    await putProjectPrj002Board(PORT, createProjectPrj002BaselineBoard());

    runPw(["open", PROJECT_URL]);

    extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 900));
          const targetNodeId = window.__workspaceBoardState?.nodes?.[0]?.id || null;
          if (!targetNodeId) return { targetNodeId: null };
          window.__clipboardWriteProbe = 0;
          window.__clipboardWriteTextProbe = 0;
          const clipboard = navigator.clipboard;
          if (clipboard?.write && !clipboard.__workspaceWrappedWrite) {
            const originalWrite = clipboard.write.bind(clipboard);
            clipboard.write = async (...args) => {
              window.__clipboardWriteProbe += 1;
              return originalWrite(...args);
            };
            clipboard.__workspaceWrappedWrite = true;
          }
          if (clipboard?.writeText && !clipboard.__workspaceWrappedWriteText) {
            const originalWriteText = clipboard.writeText.bind(clipboard);
            clipboard.writeText = async (...args) => {
              window.__clipboardWriteTextProbe += 1;
              return originalWriteText(...args);
            };
            clipboard.__workspaceWrappedWriteText = true;
          }
          window.__workspaceAppBridge?.selectNodeIds?.([targetNodeId]);
          await new Promise((resolve) => setTimeout(resolve, 120));
          return { targetNodeId };
        }`,
      ]),
    );

    runPw(["keydown", MODIFIER_KEY]);
    runPw(["press", "c"]);
    runPw(["keyup", MODIFIER_KEY]);

    const result = extractJsonResult(
      runPw([
        "eval",
        `() => ({
          clipboardWriteProbe: window.__clipboardWriteProbe || 0,
          clipboardWriteTextProbe: window.__clipboardWriteTextProbe || 0,
          pageSelectedNodeIds: window.__workspaceApp?.pageSelectedNodeIds || [],
          activeTag: document.activeElement?.tagName || null,
        })`,
      ]),
    );

    if (result.clipboardWriteProbe < 1 && result.clipboardWriteTextProbe < 1) {
      throw new Error(
        `Real ${MODIFIER_KEY}+C should write to the system clipboard API when a canvas node is selected. write: ${result.clipboardWriteProbe} writeText: ${result.clipboardWriteTextProbe}`,
      );
    }

    if (result.pageSelectedNodeIds.length === 0) {
      throw new Error("Real shortcut copy test expected a selected node before copying.");
    }

    console.log("PASS: workspace tldraw real keyboard shortcut copy writes through the system clipboard API.");
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
