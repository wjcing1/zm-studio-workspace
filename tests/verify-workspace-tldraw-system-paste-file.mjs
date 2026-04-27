import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwtpf_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PORT = 4173;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1&workspace-engine=tldraw`;

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${SESSION}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 25000,
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

          const file = new File(
            ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100"><rect width="140" height="100" rx="20" fill="#101010"/><circle cx="48" cy="50" r="24" fill="#7dd3fc"/><rect x="82" y="28" width="26" height="44" rx="8" fill="#fef08a"/></svg>'],
            "clipboard-moodboard.svg",
            { type: "image/svg+xml" },
          );
          const transfer = new DataTransfer();
          transfer.items.add(file);
          const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
          });
          Object.defineProperty(pasteEvent, "clipboardData", {
            configurable: true,
            value: transfer,
          });
          document.dispatchEvent(pasteEvent);

          const deadline = Date.now() + 5000;
          while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 120));
            const afterNodes = window.__workspaceBoardState?.nodes || [];
            const pastedNode = afterNodes.find((node) => !beforeNodeIds.includes(node.id)) || null;
            if (pastedNode) {
              const nodeElement = document.querySelector(\`.workspace-canvas-app [data-workspace-node-id="\${pastedNode.id}"]\`);
              return {
                beforeNodeCount: beforeNodes.length,
                afterNodeCount: afterNodes.length,
                pastedNode,
                hasPreviewImage: Boolean(nodeElement?.querySelector("img")),
                appSelectedNodeIds: window.__workspaceApp?.selectedNodeIds || [],
                pageSelectedNodeIds: window.__workspaceApp?.pageSelectedNodeIds || [],
              };
            }
          }

          return {
            beforeNodeCount: beforeNodes.length,
            afterNodeCount: (window.__workspaceBoardState?.nodes || []).length,
            pastedNode: null,
            hasPreviewImage: false,
            appSelectedNodeIds: window.__workspaceApp?.selectedNodeIds || [],
            pageSelectedNodeIds: window.__workspaceApp?.pageSelectedNodeIds || [],
          };
        }`,
      ]),
    );

    if (result.afterNodeCount !== result.beforeNodeCount + 1) {
      throw new Error(
        `Pasting a file from the system clipboard should create one new node. Before: ${result.beforeNodeCount} After: ${result.afterNodeCount}`,
      );
    }

    if (!result.pastedNode || result.pastedNode.type !== "file") {
      throw new Error(`Clipboard file paste should create a file card. Got ${JSON.stringify(result.pastedNode)}`);
    }

    if (result.pastedNode.fileKind !== "image") {
      throw new Error(`SVG clipboard paste should create an image file card. Got ${result.pastedNode.fileKind}`);
    }

    if (!result.hasPreviewImage) {
      throw new Error("Clipboard image paste should render an inline preview.");
    }

    if (!result.appSelectedNodeIds.includes(result.pastedNode.id)) {
      throw new Error(
        `Editor should select the newly pasted file card. Node: ${result.pastedNode.id} Selection: ${result.appSelectedNodeIds.join(", ")}`,
      );
    }

    if (!result.pageSelectedNodeIds.includes(result.pastedNode.id)) {
      throw new Error(
        `Page shell should track the newly pasted file card. Node: ${result.pastedNode.id} Selection: ${result.pageSelectedNodeIds.join(", ")}`,
      );
    }

    console.log("PASS: workspace tldraw converts system clipboard files into file cards.");
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
