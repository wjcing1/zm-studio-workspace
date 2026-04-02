import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const PORT = 4199;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1`;
const STREAM_TEXT = "这是工作区 AI 的流式建议输出，用来验证逐步渲染和操作回放。";
const STREAM_OPERATIONS = [
  {
    type: "addNode",
    node: {
      id: "workspace-stream-node",
      type: "text",
      x: 320,
      y: 240,
      w: 280,
      h: "auto",
      content: "Workspace stream node",
    },
  },
];
let session = buildSessionId();

function buildSessionId() {
  return `wstream_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
}

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${session}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 40000,
  });
}

function isRetryablePlaywrightError(error) {
  const message = String(error?.stderr || error?.message || error || "");
  return /Session closed|EADDRINUSE|Daemon process exited|Browser '.*' is not open/.test(message);
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
  const server = spawn("node", ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      MINIMAX_API_KEY: "",
      WORKSPACE_ASSISTANT_STREAM_TEST_MODE: "1",
      WORKSPACE_ASSISTANT_STREAM_TEST_TEXT: STREAM_TEXT,
      WORKSPACE_ASSISTANT_STREAM_TEST_DELAY_MS: "90",
      WORKSPACE_ASSISTANT_STREAM_TEST_OPERATIONS_JSON: JSON.stringify(STREAM_OPERATIONS),
    },
    stdio: "ignore",
  });

  try {
    await waitForServer(PAGE_URL);
    await wait(200);

    try {
      runPw(["kill-all"]);
    } catch {}

    let result = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        try {
          runPw(["kill-all"]);
        } catch {}

        await wait(150);
        session = buildSessionId();
        runPw(["open", PAGE_URL]);
        runPw([
          "eval",
          `() => {
            window.localStorage.removeItem("zm-studio-canvas:overview");
            return true;
          }`,
        ]);
        try {
          runPw(["close"]);
        } catch {}

        await wait(100);
        session = buildSessionId();
        runPw(["open", PAGE_URL]);

        result = extractJsonResult(
          runPw([
            "eval",
            `async () => {
              const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
              const panel = document.getElementById("workspaceAssistantPanel");
              const input = document.getElementById("assistantInput");
              const form = document.getElementById("assistantComposer");
              const startersRegion = document.getElementById("assistantStartersRegion");
              const messages = document.getElementById("assistantMessages");
              const stage = document.getElementById("canvasStage");

              if (!panel || !input || !form || !startersRegion || !messages || !stage) {
                return {
                  missing: true,
                  pathname: window.location.pathname,
                };
              }

              const initialNodeCount = stage.querySelectorAll(".canvas-node").length;
              document.getElementById("assistantCompanion")?.click();

              input.value = "请边总结边帮我整理画布。";
              input.dispatchEvent(new Event("input", { bubbles: true }));
              form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

              await wait(140);
              const firstAssistantBody = messages.querySelector(".assistant-message.is-assistant:last-child .assistant-message-body");
              const firstSnapshot = firstAssistantBody?.textContent?.trim() || "";
              const firstStartersState = startersRegion?.dataset?.state || "";

              await wait(220);
              const secondAssistantBody = messages.querySelector(".assistant-message.is-assistant:last-child .assistant-message-body");
              const secondSnapshot = secondAssistantBody?.textContent?.trim() || "";
              const secondStartersState = startersRegion?.dataset?.state || "";

              await wait(260);
              const finalNodeCount = stage.querySelectorAll(".canvas-node").length;
              const streamNode = [...stage.querySelectorAll(".canvas-node")].find((node) =>
                node.textContent.includes("Workspace stream node"),
              );

              return {
                missing: false,
                firstSnapshot,
                secondSnapshot,
                firstStartersState,
                secondStartersState,
                assistantMessageCount: messages.querySelectorAll(".assistant-message.is-assistant").length,
                initialNodeCount,
                finalNodeCount,
                hasStreamNode: Boolean(streamNode),
              };
            }`,
          ]),
        );
        break;
      } catch (error) {
        if (!isRetryablePlaywrightError(error) || attempt === 4) {
          throw error;
        }
        await wait(250);
      } finally {
        try {
          runPw(["close"]);
        } catch {}

        try {
          runPw(["kill-all"]);
        } catch {}
      }
    }

    if (result.missing) {
      throw new Error(`Workspace AI controls did not render on ${result.pathname}`);
    }

    if (result.assistantMessageCount < 2) {
      throw new Error(`Workspace AI should append a new assistant bubble when sending. Got ${result.assistantMessageCount}`);
    }

    if (result.firstStartersState !== "hidden" || result.secondStartersState !== "hidden") {
      throw new Error(
        `Workspace AI starter prompts should auto-hide after the first send. Got ${result.firstStartersState} -> ${result.secondStartersState}`,
      );
    }

    if (!result.firstSnapshot) {
      throw new Error("Workspace AI should render partial assistant text before the full stream completes.");
    }

    if (result.secondSnapshot.length <= result.firstSnapshot.length) {
      throw new Error(
        `Workspace AI should grow the assistant reply during streaming. Got "${result.firstSnapshot}" then "${result.secondSnapshot}"`,
      );
    }

    if (result.finalNodeCount <= result.initialNodeCount || !result.hasStreamNode) {
      throw new Error(
        `Workspace AI should still apply streamed operations. Initial nodes: ${result.initialNodeCount} Final nodes: ${result.finalNodeCount}`,
      );
    }

    console.log("PASS: Workspace AI streams incremental output, hides starters, and applies final operations.");
  } finally {
    server.kill("SIGTERM");
    await wait(300);
    if (server.exitCode === null) {
      server.kill("SIGKILL");
    }
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
