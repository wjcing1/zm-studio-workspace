import { execFileSync, spawn } from "node:child_process";
import process from "node:process";
import { createOverviewBaselineBoard, putOverviewBoard } from "./helpers/workspace-overview-baseline.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwif_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
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
          MINIMAX_API_KEY: "",
        },
        stdio: "ignore",
      });

      await waitForServer(PAGE_URL);
    }

    await resetOverviewBoard();

    runPw(["open", PAGE_URL]);

    const result = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 700));
          const originalBoard = JSON.parse(JSON.stringify(window.__workspaceBoardState || null));
          const beforeIds = new Set((window.__workspaceBoardState?.nodes || []).map((node) => node.id));

          document.getElementById("addLinkNodeBtn")?.click();
          await new Promise((resolve) => setTimeout(resolve, 180));
          const afterLinkNodes = window.__workspaceBoardState?.nodes || [];
          const linkNode = afterLinkNodes.find((node) => !beforeIds.has(node.id) && node.type === "link") || null;
          const linkTitle = linkNode
            ? document.querySelector(\`.workspace-canvas-app [data-workspace-node-id="\${linkNode.id}"] [data-link-field="title"]\`)
            : null;
          const linkUrl = linkNode
            ? document.querySelector(\`.workspace-canvas-app [data-workspace-node-id="\${linkNode.id}"] [data-link-field="url"]\`)
            : null;

          const setFieldValue = (element, value) => {
            const prototype = element instanceof HTMLTextAreaElement
              ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype;
            const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
            descriptor?.set?.call(element, value);
            element.dispatchEvent(new Event("input", { bubbles: true }));
          };

          if (linkTitle instanceof HTMLInputElement) {
            linkTitle.focus();
            setFieldValue(linkTitle, "Vendor reference");
          }
          if (linkUrl instanceof HTMLTextAreaElement) {
            linkUrl.focus();
            setFieldValue(linkUrl, "https://example.com/vendor-reference");
          }

          document.getElementById("addGroupNodeBtn")?.click();
          await new Promise((resolve) => setTimeout(resolve, 180));
          const afterGroupNodes = window.__workspaceBoardState?.nodes || [];
          const groupNode = afterGroupNodes.find((node) => !beforeIds.has(node.id) && node.type === "group") || null;
          const groupLabel = groupNode
            ? document.querySelector(\`.workspace-canvas-app [data-workspace-node-id="\${groupNode.id}"] [data-group-field="label"]\`)
            : null;

          if (groupLabel instanceof HTMLInputElement) {
            groupLabel.focus();
            setFieldValue(groupLabel, "North cluster");
          }

          await new Promise((resolve) => setTimeout(resolve, 180));

          const storedBoard = JSON.parse(window.localStorage.getItem("zm-studio-canvas:overview") || "null");
          const storedLinkNode = storedBoard?.nodes?.find((node) => node.id === linkNode?.id) || null;
          const storedGroupNode = storedBoard?.nodes?.find((node) => node.id === groupNode?.id) || null;
          if (originalBoard) {
            window.__workspaceAppBridge?.setBoardPayload(originalBoard);
            window.dispatchEvent(
              new CustomEvent("workspace-app:board-change", {
                detail: {
                  board: originalBoard,
                },
              }),
            );
            await new Promise((resolve) => setTimeout(resolve, 320));
          }

          return {
            linkNodeId: linkNode?.id || null,
            hasLinkTitleField: linkTitle instanceof HTMLInputElement,
            hasLinkUrlField: linkUrl instanceof HTMLTextAreaElement,
            storedLinkTitle: storedLinkNode?.title || "",
            storedLinkUrl: storedLinkNode?.url || storedLinkNode?.content || "",
            groupNodeId: groupNode?.id || null,
            hasGroupLabelField: groupLabel instanceof HTMLInputElement,
            storedGroupLabel: storedGroupNode?.label || "",
          };
        }`,
      ]),
    );

    if (!result.linkNodeId) {
      throw new Error("Expected the tldraw toolbar to create a link node.");
    }

    if (!result.hasLinkTitleField || !result.hasLinkUrlField) {
      throw new Error("Tldraw link cards should expose inline editable title and URL fields.");
    }

    if (result.storedLinkTitle !== "Vendor reference") {
      throw new Error(`Link title edits should persist back to board state. Stored title: ${result.storedLinkTitle}`);
    }

    if (result.storedLinkUrl !== "https://example.com/vendor-reference") {
      throw new Error(`Link URL edits should persist back to board state. Stored URL: ${result.storedLinkUrl}`);
    }

    if (!result.groupNodeId) {
      throw new Error("Expected the tldraw toolbar to create a group node.");
    }

    if (!result.hasGroupLabelField) {
      throw new Error("Tldraw group cards should expose an inline editable label field.");
    }

    if (result.storedGroupLabel !== "North cluster") {
      throw new Error(`Group label edits should persist back to board state. Stored label: ${result.storedGroupLabel}`);
    }

    console.log("PASS: workspace tldraw link and group cards expose inline editable fields that persist changes.");
  } finally {
    try {
      await restoreOverviewBoard();
    } catch {}

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
