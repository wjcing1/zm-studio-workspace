import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import { createOverviewBaselineBoard, putOverviewBoard } from "./helpers/workspace-overview-baseline.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const PORT = 4173;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1`;
let session = buildSessionId();

function buildSessionId() {
  return `wwx_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
}

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${session}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20000,
  });
}

function isRetryablePlaywrightError(error) {
  const message = String(error?.stderr || error?.message || error || "");
  return /Session closed|EADDRINUSE|Daemon process exited/.test(message);
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

async function resetOverviewBoard() {
  await putOverviewBoard(PORT, {
    ...createOverviewBaselineBoard(),
    nodes: [],
    edges: [],
  });
}

async function restoreOverviewBoard() {
  await putOverviewBoard(PORT, createOverviewBaselineBoard());
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

    await resetOverviewBoard();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        try {
          runPw(["kill-all"]);
        } catch {}

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

        session = buildSessionId();
        runPw(["open", PAGE_URL]);

        const result = extractJsonResult(
          runPw([
            "eval",
            `async () => {
          const viewport = document.getElementById("canvasViewport");
          const stage = document.getElementById("canvasStage");
          const existingIds = [...stage.querySelectorAll(".canvas-node")].map((node) => node.dataset.id);
          const viewportRect = viewport.getBoundingClientRect();
          const isBlocked = (point) =>
            document.elementsFromPoint(point.x, point.y).some((element) =>
              element?.closest?.(
                ".canvas-node, .canvas-context-shell, #canvasContextToggle, #canvasToolbar, #assistantCompanion, #workspaceAssistantPanel",
              ),
            );

          let spawnPoint = null;
          for (let y = viewportRect.top + 140; y <= viewportRect.bottom - 120 && !spawnPoint; y += 70) {
            for (let x = viewportRect.left + 100; x <= viewportRect.right - 100; x += 70) {
              const candidate = { x, y };
              if (!isBlocked(candidate)) {
                spawnPoint = candidate;
                break;
              }
            }
          }

          if (!spawnPoint) {
            return { ok: false, reason: "no-blank-canvas-space" };
          }

          viewport.dispatchEvent(
            new MouseEvent("dblclick", {
              bubbles: true,
              cancelable: true,
              clientX: spawnPoint.x,
              clientY: spawnPoint.y,
            }),
          );

          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const newNode = [...stage.querySelectorAll(".canvas-node")].find((node) => !existingIds.includes(node.dataset.id));
          const textarea = newNode?.querySelector(".canvas-textarea") || null;
          const initialNodeHeight = newNode?.getBoundingClientRect().height || 0;
          const placeholderSelected = textarea
            ? textarea.selectionStart === 0 && textarea.selectionEnd === textarea.value.length
            : false;

          if (document.activeElement === textarea) {
            textarea.setRangeText("Quick note", textarea.selectionStart, textarea.selectionEnd, "end");
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

            const longParagraph = Array.from({ length: 12 }, () => "This is a long canvas paragraph used to verify automatic node growth without clipping.")
              .join(" ");
            textarea.value = textarea.value + "\\n\\n" + longParagraph;
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }

          const storedBoard = JSON.parse(window.localStorage.getItem("zm-studio-canvas:overview") || "null");
          const storedNode = storedBoard?.nodes?.find((node) => node.id === newNode?.dataset?.id) || null;

          return {
            ok: true,
            createdNode: newNode?.dataset?.id || null,
            activeElementTag: document.activeElement?.tagName || "",
            activeElementMatches: document.activeElement === textarea,
            placeholderSelected,
            value: textarea?.value || "",
            initialNodeHeight,
            expandedNodeHeight: newNode?.getBoundingClientRect().height || 0,
            textareaClientHeight: textarea?.clientHeight || 0,
            textareaScrollHeight: textarea?.scrollHeight || 0,
            storedAutoHeight: storedNode?.autoHeight || 0,
            selectedIds: [...document.querySelectorAll(".canvas-node.is-selected")].map((node) => node.dataset.id),
          };
        }`,
      ]),
    );

        if (!result.ok) {
          throw new Error(`Text node creation probe failed: ${result.reason || "unknown reason"}`);
        }

        if (!result.createdNode) {
          throw new Error("Double-clicking blank canvas should create a new text node.");
        }

        if (!result.activeElementMatches) {
          throw new Error(
            `A new text node should enter editing mode immediately after creation. Active element: ${result.activeElementTag || "<none>"}`,
          );
        }

        if (!result.placeholderSelected) {
          throw new Error("A new text node should select its placeholder text so the first keystroke replaces it.");
        }

        if (!result.value.startsWith("Quick note")) {
          throw new Error(
            `Typing into a freshly created text node should replace the placeholder. Current value: ${result.value}`,
          );
        }

        if (result.expandedNodeHeight <= result.initialNodeHeight) {
          throw new Error(
            `Text nodes should grow as long content is entered. Initial height: ${result.initialNodeHeight} Expanded height: ${result.expandedNodeHeight}`,
          );
        }

        if (result.textareaScrollHeight > result.textareaClientHeight + 4) {
          throw new Error(
            `Text node editors should expand instead of clipping content. Client height: ${result.textareaClientHeight} Scroll height: ${result.textareaScrollHeight}`,
          );
        }

        if (result.storedAutoHeight <= result.initialNodeHeight) {
          throw new Error(
            `Expanded text node height should persist into board state. Stored autoHeight: ${result.storedAutoHeight} Initial height: ${result.initialNodeHeight}`,
          );
        }

        console.log("PASS: new text nodes enter editing mode, grow with long content, and persist their expanded height.");
        return;
      } catch (error) {
        if (!isRetryablePlaywrightError(error) || attempt === 2) {
          throw error;
        }
      } finally {
        try {
          runPw(["close"]);
        } catch {}

        try {
          runPw(["kill-all"]);
        } catch {}
      }
    }
  } finally {
    try {
      await restoreOverviewBoard();
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
