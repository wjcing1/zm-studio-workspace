import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const htmlPath = path.join(process.cwd(), "workspace.html");
  const cssPath = path.join(process.cwd(), "styles", "workspace.css");
  const scriptPath = path.join(process.cwd(), "scripts", "workspace-page.js");
  const [source, styleSource, scriptSource] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(cssPath, "utf8"),
    readFile(scriptPath, "utf8"),
  ]);

  const checks = [
    {
      ok: source.includes('id="canvasToolbar"'),
      message: "Workspace should expose a floating canvas toolbar for richer editing actions.",
    },
    {
      ok: source.includes('id="marqueeSelection"'),
      message: "Workspace should expose a marquee selection layer for multi-select.",
    },
    {
      ok: source.includes('id="assistantCompanion"'),
      message: "Workspace should expose the compact AI pulse trigger.",
    },
    {
      ok: source.includes('aria-label="Open workspace AI panel"'),
      message: "Workspace should expose an accessible label for the AI pulse trigger.",
    },
    {
      ok: !source.includes('id="assistantCompanionLabel"') && !source.includes("AI Nearby"),
      message: "Workspace should remove the mouse-following AI companion label.",
    },
    {
      ok: source.includes('id="workspaceAssistantPanel"'),
      message: "Workspace should expose the expanded AI assistant panel shell.",
    },
    {
      ok: source.includes('id="workspaceAssistantBody"') && source.includes('id="workspaceAssistantFooter"'),
      message: "Workspace AI should expose dedicated sheet body and footer regions.",
    },
    {
      ok: source.includes('id="assistantStartersRegion"'),
      message: "Workspace AI should expose a dedicated starter-prompt region.",
    },
    {
      ok: source.includes('id="assistantTimeline"') && (source.includes('role="log"') || source.includes('aria-live="polite"')),
      message: "Workspace AI should expose an accessible streaming timeline region.",
    },
    {
      ok: source.includes('id="canvasImportInput"'),
      message: "Workspace should include a JSON Canvas import input control.",
    },
    {
      ok: source.includes('id="canvasExportBtn"'),
      message: "Workspace should include a JSON Canvas export action.",
    },
    {
      ok:
        styleSource.includes(".canvas-viewport {") &&
        styleSource.includes("cursor: default;") &&
        styleSource.includes(".canvas-viewport.is-panning") &&
        styleSource.includes("cursor: grabbing;") &&
        !styleSource.includes("cursor: none;"),
      message: "Workspace canvas should keep the normal mouse cursor behavior.",
    },
    {
      ok: styleSource.includes("animation: assistantPulse") && styleSource.includes("@keyframes assistantPulse"),
      message: "Workspace should style the AI trigger as a breathing pulse.",
    },
    {
      ok:
        styleSource.includes(".workspace-assistant-sheet") &&
        styleSource.includes(".workspace-assistant-body") &&
        styleSource.includes(".workspace-assistant-footer"),
      message: "Workspace should style the GPT-style sheet regions.",
    },
    {
      ok: !scriptSource.includes("positionAssistantCompanion("),
      message: "Workspace should not keep JavaScript for a mouse-following AI trigger.",
    },
    {
      ok: scriptSource.includes('fetch("/api/workspace-assistant"') && scriptSource.includes("response.body.getReader"),
      message: "Workspace AI should stream prompts through /api/workspace-assistant instead of waiting for one final payload.",
    },
    {
      ok: scriptSource.includes("showStarters"),
      message: "Workspace AI should track starter-prompt visibility in client state.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: workspace copilot UI markers are present.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
