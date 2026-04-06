import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import {
  createProjectPrj002BaselineBoard,
  putProjectPrj002Board,
} from "./helpers/workspace-project-prj002-baseline.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwtcp_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
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
          MINIMAX_API_KEY: "",
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
          const beforeNodeIds = (window.__workspaceBoardState?.nodes || []).map((node) => node.id);
          const sourceNodeId = beforeNodeIds[0] || null;
          if (!sourceNodeId) {
            return { sourceNodeId: null };
          }

          window.__workspaceAppBridge?.selectNodeIds?.([sourceNodeId]);
          await new Promise((resolve) => setTimeout(resolve, 120));

          const copyTransfer = new DataTransfer();
          const copyEvent = new ClipboardEvent("copy", {
            bubbles: true,
            cancelable: true,
          });
          Object.defineProperty(copyEvent, "clipboardData", {
            configurable: true,
            value: copyTransfer,
          });
          document.dispatchEvent(copyEvent);
          await new Promise((resolve) => setTimeout(resolve, 80));

          const pasteTransfer = new DataTransfer();
          pasteTransfer.setData("text/plain", copyTransfer.getData("text/plain"));
          pasteTransfer.setData("text/html", copyTransfer.getData("text/html"));
          try {
            pasteTransfer.setData(
              "application/x-zm-workspace+json",
              copyTransfer.getData("application/x-zm-workspace+json"),
            );
          } catch {}
          const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
          });
          Object.defineProperty(pasteEvent, "clipboardData", {
            configurable: true,
            value: pasteTransfer,
          });
          document.dispatchEvent(pasteEvent);
          await new Promise((resolve) => setTimeout(resolve, 220));

          const afterNodes = window.__workspaceBoardState?.nodes || [];
          const afterNodeIds = afterNodes.map((node) => node.id);
          const pastedNodeIds = afterNodeIds.filter((nodeId) => !beforeNodeIds.includes(nodeId));

          return {
            sourceNodeId,
            beforeNodeCount: beforeNodeIds.length,
            afterNodeCount: afterNodeIds.length,
            pastedNodeIds,
            copiedText: copyTransfer.getData("text/plain"),
            copiedHtml: copyTransfer.getData("text/html"),
            copiedInternal: copyTransfer.getData("application/x-zm-workspace+json"),
            pageSelectedNodeIds: window.__workspaceApp?.pageSelectedNodeIds || [],
            appSelectedNodeIds: window.__workspaceApp?.selectedNodeIds || [],
          };
        }`,
      ]),
    );

    if (!result.sourceNodeId) {
      throw new Error("Copy/paste test expected a project board with at least one node.");
    }

    if (result.afterNodeCount !== result.beforeNodeCount + 1) {
      throw new Error(
        `Copy/paste should create one additional node in tldraw mode. Before: ${result.beforeNodeCount} After: ${result.afterNodeCount}`,
      );
    }

    if (result.pastedNodeIds.length !== 1) {
      throw new Error(
        `Copy/paste should create exactly one fresh node id. New ids: ${result.pastedNodeIds.join(", ")}`,
      );
    }

    if (!result.copiedText || !result.copiedText.trim()) {
      throw new Error("Copy should publish readable text/plain content to the system clipboard.");
    }

    if (!String(result.copiedHtml || "").includes("data-zm-workspace=")) {
      throw new Error("Copy should publish a structured workspace HTML payload for round-tripping.");
    }

    if (!result.copiedInternal || !String(result.copiedInternal || "").includes('"nodes"')) {
      throw new Error("Copy should publish a structured workspace JSON payload for same-app paste.");
    }

    if (!result.pageSelectedNodeIds.includes(result.pastedNodeIds[0])) {
      throw new Error(
        `Page shell should select the pasted node. New node: ${result.pastedNodeIds[0]} Page selection: ${result.pageSelectedNodeIds.join(", ")}`,
      );
    }

    if (!result.appSelectedNodeIds.includes(result.pastedNodeIds[0])) {
      throw new Error(
        `Tldraw editor should select the pasted node. New node: ${result.pastedNodeIds[0]} Editor selection: ${result.appSelectedNodeIds.join(", ")}`,
      );
    }

    console.log("PASS: workspace tldraw copy and paste shortcuts duplicate the selected node through the canvas shell.");
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
