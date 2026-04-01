import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const stylePath = path.join(process.cwd(), "styles", "projects.css");
  const source = await readFile(stylePath, "utf8");

  const checks = [
    {
      ok: source.includes(".projects-assistant-sheet") && source.includes("grid-template-rows: auto minmax(0, 1fr) auto;"),
      message: "Projects AI panel should split into fixed header, scrollable body, and fixed footer regions.",
    },
    {
      ok: source.includes(".projects-assistant-panel") && source.includes("overflow: hidden;"),
      message: "Projects AI panel should keep the outer shell fixed instead of scrolling the whole dialog.",
    },
    {
      ok: source.includes(".projects-assistant-timeline") && source.includes("overflow-y: auto;"),
      message: "Projects AI timeline should own the vertical scroll behavior.",
    },
    {
      ok: source.includes(".projects-assistant-footer") && source.includes("border-top: 1px solid rgba(255, 255, 255, 0.08);"),
      message: "Projects AI footer should stay visually pinned as a separate composer region.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Projects AI panel uses a fixed-sheet scroll layout.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
