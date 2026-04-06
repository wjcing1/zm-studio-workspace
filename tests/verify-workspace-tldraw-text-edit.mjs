import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwtx_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
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
          await new Promise((resolve) => setTimeout(resolve, 700));
          const beforeIds = (window.__workspaceBoardState?.nodes || []).map((node) => node.id);
          document.getElementById("addTextNodeBtn")?.click();
          await new Promise((resolve) => setTimeout(resolve, 180));
          const afterNodes = window.__workspaceBoardState?.nodes || [];
          const newNode = afterNodes.find((node) => !beforeIds.includes(node.id)) || null;
          const textarea = newNode
            ? document.querySelector(\`.workspace-canvas-app .canvas-textarea[data-text-node="\${newNode.id}"]\`)
            : null;

          const placeholderSelected = textarea
            ? textarea.selectionStart === 0 && textarea.selectionEnd === textarea.value.length
            : false;
          const initialNodeHeight = newNode?.autoHeight || newNode?.h || 0;

          const setTextareaValue = (element, value) => {
            const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
            descriptor?.set?.call(element, value);
            element.dispatchEvent(new Event("input", { bubbles: true }));
          };

          if (textarea) {
            setTextareaValue(textarea, "Quick note");
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

            const longParagraph = Array.from({ length: 12 }, () => "This is a long canvas paragraph used to verify automatic node growth without clipping.")
              .join(" ");
            setTextareaValue(textarea, textarea.value + "\\n\\n" + longParagraph);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }

          const storedBoard = JSON.parse(window.localStorage.getItem("zm-studio-canvas:overview") || "null");
          const storedNode = storedBoard?.nodes?.find((node) => node.id === newNode?.id) || null;

          return {
            createdNodeId: newNode?.id || null,
            activeMatches: document.activeElement === textarea,
            placeholderSelected,
            value: textarea?.value || "",
            initialNodeHeight,
            expandedNodeHeight: storedNode?.autoHeight || storedNode?.h || 0,
            textareaClientHeight: textarea?.clientHeight || 0,
            textareaScrollHeight: textarea?.scrollHeight || 0,
          };
        }`,
      ]),
    );

    if (!result.createdNodeId) {
      throw new Error("Tldraw text edit test expected toolbar creation to produce a fresh text node.");
    }

    if (!result.activeMatches) {
      throw new Error("A new tldraw text node should enter editing mode immediately.");
    }

    if (!result.placeholderSelected) {
      throw new Error("A new tldraw text node should select its placeholder text on focus.");
    }

    if (!result.value.startsWith("Quick note")) {
      throw new Error(`Typing should replace the placeholder in the tldraw text editor. Current value: ${result.value}`);
    }

    if (result.expandedNodeHeight <= result.initialNodeHeight) {
      throw new Error(
        `Tldraw text nodes should grow with long content. Initial height: ${result.initialNodeHeight} Expanded height: ${result.expandedNodeHeight}`,
      );
    }

    if (result.textareaScrollHeight > result.textareaClientHeight + 4) {
      throw new Error(
        `Tldraw text editors should expand instead of clipping content. Client height: ${result.textareaClientHeight} Scroll height: ${result.textareaScrollHeight}`,
      );
    }

    console.log("PASS: workspace tldraw text cards edit inline, replace placeholder text, and persist auto height.");
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
