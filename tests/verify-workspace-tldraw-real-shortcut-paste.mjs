import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwtrp_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PORT = 4173;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1&workspace-engine=tldraw`;
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

    extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 900));
          window.__clipboardReadProbe = 0;
          window.__clipboardReadTextProbe = 0;
          const clipboard = navigator.clipboard;
          if (clipboard?.read && !clipboard.__workspaceWrappedRead) {
            clipboard.read = async () => {
              window.__clipboardReadProbe += 1;
              return [
                new ClipboardItem({
                  "text/plain": new Blob(["Real shortcut paste note"], { type: "text/plain" }),
                }),
              ];
            };
            clipboard.__workspaceWrappedRead = true;
          }
          if (clipboard?.readText && !clipboard.__workspaceWrappedReadText) {
            clipboard.readText = async () => {
              window.__clipboardReadTextProbe += 1;
              return "Real shortcut paste note";
            };
            clipboard.__workspaceWrappedReadText = true;
          }
          return {
            beforeNodeCount: window.__workspaceBoardState?.nodes?.length || 0,
          };
        }`,
      ]),
    );

    runPw(["keydown", MODIFIER_KEY]);
    runPw(["press", "v"]);
    runPw(["keyup", MODIFIER_KEY]);

    const result = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 220));
          const nodes = window.__workspaceBoardState?.nodes || [];
          const pastedNode = [...nodes].reverse().find((node) => String(node.content || "").includes("Real shortcut paste note")) || null;
          return {
            afterNodeCount: nodes.length,
            pastedNode,
            clipboardReadProbe: window.__clipboardReadProbe || 0,
            clipboardReadTextProbe: window.__clipboardReadTextProbe || 0,
            pageSelectedNodeIds: window.__workspaceApp?.pageSelectedNodeIds || [],
          };
        }`,
      ]),
    );

    if (result.clipboardReadProbe < 1 && result.clipboardReadTextProbe < 1) {
      throw new Error(
        `Real ${MODIFIER_KEY}+V should read from the system clipboard API. read: ${result.clipboardReadProbe} readText: ${result.clipboardReadTextProbe}`,
      );
    }

    if (!result.pastedNode || result.pastedNode.type !== "text") {
      throw new Error(`Real shortcut paste should create a text card. Got ${JSON.stringify(result.pastedNode)}`);
    }

    if (!result.pageSelectedNodeIds.includes(result.pastedNode.id)) {
      throw new Error(
        `Real shortcut paste should select the new node. Node: ${result.pastedNode.id} Selection: ${result.pageSelectedNodeIds.join(", ")}`,
      );
    }

    console.log("PASS: workspace tldraw real keyboard shortcut paste reads through the system clipboard API.");
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
