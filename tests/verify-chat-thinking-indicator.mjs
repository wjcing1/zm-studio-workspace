import { execFileSync } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const PAGE_URL = "http://127.0.0.1:4173/assets.html?codex-test-auth=1";
let session = buildSessionId();

function buildSessionId() {
  return `verify_chat_thinking_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${session}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20000,
  });
}

function openPage() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      runPw(["open", PAGE_URL]);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("EADDRINUSE") || attempt === 2) {
        throw error;
      }
      session = buildSessionId();
    }
  }
}

function extractJsonResult(output) {
  const match = output.match(/### Result\s+([\s\S]*?)\n### Ran Playwright code/);
  if (!match) {
    throw new Error(`Unable to parse Playwright output:\n${output}`);
  }
  return JSON.parse(match[1].trim());
}

try {
  openPage();

  const result = runPw([
    "eval",
    `async () => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (...args) => {
        const resource = args[0];
        const url = typeof resource === "string" ? resource : resource?.url || "";
        if (url.includes("/api/chat")) {
          return new Promise((resolve, reject) => {
            window.setTimeout(() => {
              originalFetch(...args).then(resolve).catch(reject);
            }, 1200);
          });
        }
        return originalFetch(...args);
      };

      const input = document.getElementById("assistantInput");
      const form = document.getElementById("assistantComposer");
      input.value = "请展示思考动画";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

      await new Promise((resolve) => window.setTimeout(resolve, 150));

      const bubble = document.querySelector(".assistant-message.is-thinking");

      return {
        hasThinkingBubble: Boolean(bubble),
        statusText: document.getElementById("assistantStatus")?.textContent?.trim() || "",
        dotCount: bubble ? bubble.querySelectorAll(".thinking-dot").length : 0
      };
    }`,
  ]);

  const payload = extractJsonResult(result);

  if (!payload.hasThinkingBubble) {
    throw new Error(
      `AI thread should render a thinking bubble before the response resolves. Got: ${JSON.stringify(payload)}`,
    );
  }

  console.log("PASS: AI thinking indicator appears before the reply resolves.");
} catch (error) {
  console.error(error instanceof Error ? `FAIL: ${error.message}` : "FAIL: browser verification failed.");
  process.exit(1);
} finally {
  try {
    runPw(["close"]);
  } catch {}
}
