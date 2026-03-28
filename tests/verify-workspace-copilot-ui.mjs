import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const htmlPath = path.join(process.cwd(), "workspace.html");
  const source = await readFile(htmlPath, "utf8");

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
      message: "Workspace should expose the mouse-following AI companion shell.",
    },
    {
      ok: source.includes('id="workspaceAssistantPanel"'),
      message: "Workspace should expose the expanded AI assistant panel shell.",
    },
    {
      ok: source.includes('id="canvasImportInput"'),
      message: "Workspace should include a JSON Canvas import input control.",
    },
    {
      ok: source.includes('id="canvasExportBtn"'),
      message: "Workspace should include a JSON Canvas export action.",
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
