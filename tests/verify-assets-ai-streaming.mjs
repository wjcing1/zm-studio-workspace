import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const PORT = 4198;
const PAGE_URL = `http://127.0.0.1:${PORT}/assets.html?codex-test-auth=1`;
const STREAM_TEXT = "这是资产页 AI 的流式建议输出，用来验证逐步渲染和推荐区自动收起。";
let session = buildSessionId();

function buildSessionId() {
  return `astream_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
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
      OPENAI_API_KEY: "",
      CHAT_STREAM_TEST_MODE: "1",
      CHAT_STREAM_TEST_TEXT: STREAM_TEXT,
      CHAT_STREAM_TEST_DELAY_MS: "90",
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

        result = extractJsonResult(
          runPw([
            "eval",
            `async () => {
              const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
              const companion = document.getElementById("assistantCompanion");
              const panel = document.getElementById("assistantPanel");
              const input = document.getElementById("assistantInput");
              const form = document.getElementById("assistantComposer");
              const startersRegion = document.getElementById("assistantStartersRegion");
              const messages = document.getElementById("assistantMessages");

              if (!companion || !panel || !input || !form || !startersRegion || !messages) {
                return {
                  missing: true,
                  pathname: window.location.pathname,
                };
              }

              companion.click();
              input.value = "帮我找一下最适合先看的资产和对应项目。";
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

              return {
                missing: false,
                firstSnapshot,
                secondSnapshot,
                firstStartersState,
                secondStartersState,
                assistantMessageCount: messages.querySelectorAll(".assistant-message.is-assistant").length,
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
      throw new Error(`Assets AI controls did not render on ${result.pathname}`);
    }

    if (result.assistantMessageCount < 2) {
      throw new Error(`Assets AI should append a new assistant bubble when sending. Got ${result.assistantMessageCount}`);
    }

    if (result.firstStartersState !== "hidden" || result.secondStartersState !== "hidden") {
      throw new Error(
        `Assets AI starter prompts should auto-hide after the first send. Got ${result.firstStartersState} -> ${result.secondStartersState}`,
      );
    }

    if (!result.firstSnapshot) {
      throw new Error("Assets AI should render partial assistant text before the full stream completes.");
    }

    if (result.secondSnapshot.length <= result.firstSnapshot.length) {
      throw new Error(
        `Assets AI should grow the assistant reply during streaming. Got "${result.firstSnapshot}" then "${result.secondSnapshot}"`,
      );
    }

    console.log("PASS: Assets AI streams incremental output and auto-hides starter prompts.");
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
