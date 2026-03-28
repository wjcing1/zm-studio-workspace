import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const [htmlSource, appSource, styleSource] = await Promise.all([
    readFile(path.join(process.cwd(), "workspace.html"), "utf8"),
    readFile(path.join(process.cwd(), "scripts", "workspace-page.js"), "utf8"),
    readFile(path.join(process.cwd(), "styles", "workspace.css"), "utf8"),
  ]);

  const checks = [
    {
      ok: htmlSource.includes('id="canvasContextToggle"'),
      message: "Workspace canvas should expose a manual context toggle control.",
    },
    {
      ok: appSource.includes("isContextCollapsed"),
      message: "Workspace canvas logic should track whether the context shell is collapsed.",
    },
    {
      ok:
        appSource.includes('beginUndoableInteraction("pan"') &&
        appSource.includes('state.interaction.mode === "pan"') &&
        appSource.includes("collapseCanvasContext()"),
      message: "Workspace canvas should collapse the context shell when camera navigation begins.",
    },
    {
      ok: styleSource.includes(".canvas-viewport.is-context-collapsed .canvas-context-shell"),
      message: "Workspace styles should define a collapsed state for the context shell.",
    },
    {
      ok:
        styleSource.includes(".canvas-context-toggle {") &&
        styleSource.includes("position: absolute;") &&
        styleSource.includes("top: 0;") &&
        styleSource.includes("left: 0;"),
      message: "Collapsed context toggle should be anchored to the top-left of the canvas overlay.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Canvas context collapse markers are present.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
