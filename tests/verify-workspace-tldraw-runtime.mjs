import { execFileSync } from "node:child_process";
import process from "node:process";
import { startIsolatedWorkspaceServer } from "./helpers/isolated-workspace-server.mjs";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwr_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PAGE_PATH = "/workspace.html?codex-test-auth=1";
const TLDRAW_PATH = `${PAGE_PATH}&workspace-engine=tldraw`;

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

function parseRgbChannels(value) {
  if (typeof value !== "string") return null;
  const matches = value.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 3) return null;
  return matches.slice(0, 3).map((channel) => Number(channel));
}

async function main() {
  let runtime = null;

  try {
    try {
      runPw(["kill-all"]);
    } catch {}

    runtime = await startIsolatedWorkspaceServer({
      cwd: process.cwd(),
      healthPath: PAGE_PATH,
    });
    const PAGE_URL = `http://127.0.0.1:${runtime.port}${PAGE_PATH}`;
    const TLDRAW_URL = `http://127.0.0.1:${runtime.port}${TLDRAW_PATH}`;

    runPw(["open", PAGE_URL]);

    const hybridResult = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const viewport = document.getElementById("canvasViewport");
          const workspaceCanvasApp = document.getElementById("workspaceCanvasApp");
          const tlBackground = document.querySelector(".workspace-canvas-app .tl-background");
          const firstNode = document.querySelector(".workspace-canvas-app [data-workspace-node-id]");
          const firstNodeShell = firstNode?.querySelector(".workspace-tldraw-card-shell");
          const arrowStroke = Array.from(
            document.querySelectorAll("[data-shape-type='arrow'] path, [data-shape-type='arrow'] line, [data-shape-type='arrow'] polygon"),
          ).find((segment) => getComputedStyle(segment).stroke !== "none");
          const outerNodeVisualLeaks = Array.from(document.querySelectorAll("[data-workspace-node-id]"))
            .map((node) => {
              const styles = getComputedStyle(node);
              return {
                nodeId: node.getAttribute("data-workspace-node-id"),
                background: styles.backgroundColor,
                borderTopStyle: styles.borderTopStyle,
                borderTopWidth: styles.borderTopWidth,
                overflow: styles.overflow,
              };
            })
            .filter(
              (node) =>
                node.background !== "rgba(0, 0, 0, 0)" ||
                node.borderTopStyle !== "none" ||
                node.borderTopWidth !== "0px" ||
                node.overflow !== "visible",
            );
          return {
            routeMode: viewport?.dataset?.workspaceMode || null,
            hasDebugApp: Boolean(window.__workspaceApp),
            engine: window.__workspaceApp?.engine || null,
            ready: window.__workspaceApp?.ready === true,
            engineAttr: workspaceCanvasApp?.dataset?.workspaceEngine || null,
            clipboardMode: window.__workspaceClipboardMode || null,
            hasTldrawMount: Boolean(document.querySelector(".tl-canvas, .tl-container, [data-workspace-engine='tldraw']")),
            hasToolbar: Boolean(document.getElementById("canvasToolbar")),
            hasAssistantPanel: Boolean(document.getElementById("workspaceAssistantPanel")),
            backgroundColor: tlBackground ? getComputedStyle(tlBackground).backgroundColor : null,
            firstNodeClass: firstNode?.className || null,
            firstNodeBackground: firstNode ? getComputedStyle(firstNode).backgroundColor : null,
            firstNodeBorderRadius: firstNode ? getComputedStyle(firstNode).borderRadius : null,
            firstNodeShellBorderRadius: firstNodeShell ? getComputedStyle(firstNodeShell).borderRadius : null,
            connectionStroke: arrowStroke ? getComputedStyle(arrowStroke).stroke : null,
            outerNodeVisualLeaks,
          };
        }`,
      ]),
    );

    if (!hybridResult.hasDebugApp) {
      throw new Error("Workspace page should expose a debug app handle after mounting the new editor.");
    }

    if (hybridResult.routeMode !== "hybrid") {
      throw new Error(`Plain workspace route should mount in hybrid mode. Got ${hybridResult.routeMode || "<none>"}`);
    }

    if (hybridResult.engine !== "tldraw" || hybridResult.engineAttr !== "tldraw") {
      throw new Error(`Workspace app should report the tldraw engine on the hybrid route. Actual: ${hybridResult.engine || "<none>"} Attr: ${hybridResult.engineAttr || "<none>"}`);
    }

    if (!hybridResult.ready) {
      throw new Error("Workspace app should report itself as ready after mounting.");
    }

    if (hybridResult.clipboardMode !== "tldraw") {
      throw new Error(`Hybrid mode should delegate clipboard ownership to tldraw. Got ${hybridResult.clipboardMode || "<none>"}`);
    }

    if (!hybridResult.hasTldrawMount) {
      throw new Error("Workspace page should mount a tldraw editor surface.");
    }

    if (!hybridResult.hasToolbar || !hybridResult.hasAssistantPanel) {
      throw new Error("Workspace page should preserve the existing toolbar and assistant shell markers.");
    }

    if (hybridResult.backgroundColor === "rgb(249, 250, 251)") {
      throw new Error("Hybrid workspace should not let tldraw restore the default light canvas background.");
    }

    if (hybridResult.firstNodeBackground !== "rgba(0, 0, 0, 0)") {
      throw new Error(
        `Hybrid workspace should render tldraw cards without an extra outer rectangle fill. Got ${hybridResult.firstNodeBackground || "<none>"}`,
      );
    }

    if (hybridResult.firstNodeBorderRadius !== hybridResult.firstNodeShellBorderRadius) {
      throw new Error(
        `Hybrid workspace outer node shell should match the rounded card shell. Outer: ${hybridResult.firstNodeBorderRadius || "<none>"} Inner: ${hybridResult.firstNodeShellBorderRadius || "<none>"}`,
      );
    }

    const connectionStrokeChannels = parseRgbChannels(hybridResult.connectionStroke);
    if (!connectionStrokeChannels) {
      throw new Error("Hybrid workspace should expose a visible tldraw connection stroke for visual verification.");
    }

    const connectionBrightness =
      connectionStrokeChannels.reduce((sum, channel) => sum + channel, 0) / connectionStrokeChannels.length;
    const connectionSpread = Math.max(...connectionStrokeChannels) - Math.min(...connectionStrokeChannels);

    if (connectionBrightness < 120 || connectionSpread > 40) {
      throw new Error(
        `Hybrid workspace should render tldraw connections as a lighter neutral stroke. Got ${hybridResult.connectionStroke || "<none>"}`,
      );
    }

    if (hybridResult.outerNodeVisualLeaks.length > 0) {
      throw new Error(
        `Hybrid workspace should keep legacy outer card chrome off tldraw containers. Got ${JSON.stringify(hybridResult.outerNodeVisualLeaks)}`,
      );
    }

    const hybridSelectionResult = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          const targetNodeId = window.__workspaceBoardState?.nodes?.[0]?.id || null;
          if (!targetNodeId) {
            return { targetNodeId: null };
          }

          window.__workspaceAppBridge?.selectNodeIds?.([targetNodeId]);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const selectionStroke = Array.from(document.querySelectorAll(".tl-shape-indicator, .tl-selection__fg__outline, .tl-corner-handle"))
            .map((element) => getComputedStyle(element).stroke)
            .find(Boolean);
          const assistantPanel = document.getElementById("workspaceAssistantPanel");
          const assistantCompanion = document.getElementById("assistantCompanion");

          return {
            targetNodeId,
            selectionStroke: selectionStroke || null,
            selectedNodeIds: window.__workspaceApp?.selectedNodeIds || [],
            assistantHidden: assistantPanel ? assistantPanel.hidden : null,
            hasAiContext: assistantCompanion ? assistantCompanion.classList.contains("has-context") : null,
          };
        }`,
      ]),
    );

    if (!hybridSelectionResult.targetNodeId || !hybridSelectionResult.selectedNodeIds.includes(hybridSelectionResult.targetNodeId)) {
      throw new Error(
        `Hybrid runtime visual selection check should select a node before measuring its indicator. Target: ${hybridSelectionResult.targetNodeId || "<none>"} Selected: ${(hybridSelectionResult.selectedNodeIds || []).join(", ")}`,
      );
    }

    const selectionStrokeChannels = parseRgbChannels(hybridSelectionResult.selectionStroke);
    if (!selectionStrokeChannels) {
      throw new Error("Hybrid runtime visual selection check should expose a tldraw selection indicator stroke.");
    }

    const looksBlue =
      selectionStrokeChannels[2] > selectionStrokeChannels[0] + 30 &&
      selectionStrokeChannels[2] > selectionStrokeChannels[1] + 15;

    if (!hybridSelectionResult.assistantHidden || hybridSelectionResult.hasAiContext) {
      throw new Error("Hybrid runtime selection check expected AI to stay closed and context-free while measuring the default selection state.");
    }

    if (looksBlue) {
      throw new Error(
        `Hybrid workspace should not use the AI blue accent for plain selection before the assistant opens. Got ${hybridSelectionResult.selectionStroke || "<none>"}`,
      );
    }

    const hybridAiContextResult = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          document.getElementById("assistantCompanion")?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const selectionStroke = Array.from(document.querySelectorAll(".tl-shape-indicator, .tl-selection__fg__outline, .tl-corner-handle"))
            .map((element) => getComputedStyle(element).stroke)
            .find(Boolean);
          const assistantPanel = document.getElementById("workspaceAssistantPanel");
          const assistantCompanion = document.getElementById("assistantCompanion");
          const workspaceCanvasApp = document.getElementById("workspaceCanvasApp");

          return {
            selectionStroke: selectionStroke || null,
            assistantHidden: assistantPanel ? assistantPanel.hidden : null,
            hasAiContext: assistantCompanion ? assistantCompanion.classList.contains("has-context") : null,
            aiContextAttr: workspaceCanvasApp?.dataset?.aiContextActive || null,
            assistantOpenAttr: workspaceCanvasApp?.dataset?.assistantOpen || null,
          };
        }`,
      ]),
    );

    const aiContextSelectionStrokeChannels = parseRgbChannels(hybridAiContextResult.selectionStroke);
    if (!aiContextSelectionStrokeChannels) {
      throw new Error("Hybrid AI context visual check should expose a tldraw selection indicator stroke.");
    }

    const aiLooksBlue =
      aiContextSelectionStrokeChannels[2] > aiContextSelectionStrokeChannels[0] + 30 &&
      aiContextSelectionStrokeChannels[2] > aiContextSelectionStrokeChannels[1] + 15;

    if (hybridAiContextResult.assistantHidden || !hybridAiContextResult.hasAiContext) {
      throw new Error("Hybrid AI context visual check expected the assistant to open with the current selection locked as context.");
    }

    if (hybridAiContextResult.aiContextAttr !== "true" || hybridAiContextResult.assistantOpenAttr !== "true") {
      throw new Error(
        `Hybrid AI context visual check expected workspaceCanvasApp to expose assistant state. Context: ${hybridAiContextResult.aiContextAttr || "<none>"} Open: ${hybridAiContextResult.assistantOpenAttr || "<none>"}`,
      );
    }

    if (!aiLooksBlue) {
      throw new Error(
        `Hybrid workspace should restore the AI blue accent once the assistant locks the selection as context. Got ${hybridAiContextResult.selectionStroke || "<none>"}`,
      );
    }

    extractJsonResult(
      runPw([
        "eval",
        `async () => {
          window.location.assign(${JSON.stringify(TLDRAW_URL)});
          return { navigating: true };
        }`,
      ]),
    );

    const debugResult = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const viewport = document.getElementById("canvasViewport");
          const workspaceCanvasApp = document.getElementById("workspaceCanvasApp");
          return {
            routeMode: viewport?.dataset?.workspaceMode || null,
            engine: window.__workspaceApp?.engine || null,
            ready: window.__workspaceApp?.ready === true,
            engineAttr: workspaceCanvasApp?.dataset?.workspaceEngine || null,
            hasTldrawMount: Boolean(document.querySelector(".tl-canvas, .tl-container, [data-workspace-engine='tldraw']")),
          };
        }`,
      ]),
    );

    if (debugResult.routeMode !== "tldraw") {
      throw new Error(`workspace-engine=tldraw should resolve to the focused tldraw route. Got ${debugResult.routeMode || "<none>"}`);
    }

    if (debugResult.engine !== "tldraw" || debugResult.engineAttr !== "tldraw" || !debugResult.ready || !debugResult.hasTldrawMount) {
      throw new Error("workspace-engine=tldraw should keep the standalone tldraw runtime available for focused testing.");
    }

    console.log("PASS: workspace runtime mounts tldraw for both the hybrid default route and the focused tldraw route.");
  } finally {
    try {
      runPw(["close"]);
    } catch {}

    try {
      runPw(["kill-all"]);
    } catch {}

    await runtime?.stop?.();
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
