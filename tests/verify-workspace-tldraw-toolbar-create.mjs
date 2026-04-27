import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwtt_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PORT = 4173;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1&workspace-engine=tldraw`;

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
          OPENAI_API_KEY: "",
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
          await new Promise((resolve) => setTimeout(resolve, 700));
          const beforeIds = (window.__workspaceBoardState?.nodes || []).map((node) => node.id);
          const beforeNodeCount = window.__workspaceApp?.nodeCount || 0;
          document.getElementById("addTextNodeBtn")?.click();
          await new Promise((resolve) => setTimeout(resolve, 180));
          const afterNodes = window.__workspaceBoardState?.nodes || [];
          const newNode = afterNodes.find((node) => !beforeIds.includes(node.id)) || null;
          const textarea = newNode
            ? document.querySelector(\`.workspace-canvas-app .canvas-textarea[data-text-node="\${newNode.id}"]\`)
            : null;

          return {
            beforeNodeCount,
            afterNodeCount: window.__workspaceApp?.nodeCount || 0,
            newNodeId: newNode?.id || null,
            appSelectedNodeIds: window.__workspaceApp?.selectedNodeIds || [],
            pageSelectedNodeIds: window.__workspaceApp?.pageSelectedNodeIds || [],
            activeMatches: document.activeElement === textarea,
          };
        }`,
      ]),
    );

    if (result.afterNodeCount !== result.beforeNodeCount + 1) {
      throw new Error(
        `Tldraw toolbar should create one node per click. Before: ${result.beforeNodeCount} After: ${result.afterNodeCount}`,
      );
    }

    if (!result.newNodeId) {
      throw new Error("Tldraw toolbar should create a fresh text node that appears in board state.");
    }

    if (!result.appSelectedNodeIds.includes(result.newNodeId)) {
      throw new Error(
        `Tldraw toolbar should select the newly created node inside the editor. New node: ${result.newNodeId} Selection: ${result.appSelectedNodeIds.join(", ")}`,
      );
    }

    if (!result.pageSelectedNodeIds.includes(result.newNodeId)) {
      throw new Error(
        `Tldraw toolbar should sync the new selection back to the page shell. New node: ${result.newNodeId} Page selection: ${result.pageSelectedNodeIds.join(", ")}`,
      );
    }

    if (!result.activeMatches) {
      throw new Error("Creating a text node from the toolbar should focus its inline editor immediately.");
    }

    console.log("PASS: workspace tldraw toolbar creates and selects text nodes through the editor bridge.");
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
