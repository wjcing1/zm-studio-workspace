import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwtpt_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
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
          const beforeNodes = window.__workspaceBoardState?.nodes || [];
          const beforeNodeIds = beforeNodes.map((node) => node.id);
          const transfer = new DataTransfer();
          transfer.setData("text/plain", "Cross app clipboard note\\n\\nSecond paragraph");
          const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
          });
          Object.defineProperty(pasteEvent, "clipboardData", {
            configurable: true,
            value: transfer,
          });
          document.dispatchEvent(pasteEvent);
          await new Promise((resolve) => setTimeout(resolve, 220));

          const afterNodes = window.__workspaceBoardState?.nodes || [];
          const pastedNode = afterNodes.find((node) => !beforeNodeIds.includes(node.id)) || null;

          return {
            beforeNodeCount: beforeNodes.length,
            afterNodeCount: afterNodes.length,
            pastedNode,
            appSelectedNodeIds: window.__workspaceApp?.selectedNodeIds || [],
            pageSelectedNodeIds: window.__workspaceApp?.pageSelectedNodeIds || [],
          };
        }`,
      ]),
    );

    if (result.afterNodeCount !== result.beforeNodeCount + 1) {
      throw new Error(
        `Pasting external text should create one new canvas node. Before: ${result.beforeNodeCount} After: ${result.afterNodeCount}`,
      );
    }

    if (!result.pastedNode || result.pastedNode.type !== "text") {
      throw new Error(`External plain text should create a text card. Got ${JSON.stringify(result.pastedNode)}`);
    }

    if (!String(result.pastedNode.content || "").includes("Cross app clipboard note")) {
      throw new Error(`Pasted text card should preserve clipboard content. Got ${result.pastedNode.content || ""}`);
    }

    if (!result.appSelectedNodeIds.includes(result.pastedNode.id)) {
      throw new Error(
        `Editor should select the newly pasted text card. Node: ${result.pastedNode.id} Selection: ${result.appSelectedNodeIds.join(", ")}`,
      );
    }

    if (!result.pageSelectedNodeIds.includes(result.pastedNode.id)) {
      throw new Error(
        `Page shell should track the newly pasted text card. Node: ${result.pastedNode.id} Selection: ${result.pageSelectedNodeIds.join(", ")}`,
      );
    }

    console.log("PASS: workspace tldraw converts external plain-text paste into a text card.");
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
