import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const htmlPath = path.join(process.cwd(), "222.html");
  const appPath = path.join(process.cwd(), "app.js");
  const [htmlSource, appSource] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(appPath, "utf8"),
  ]);

  const checks = [
    {
      ok: htmlSource.includes('id="canvasBreadcrumb"'),
      message: "Canvas view should expose a breadcrumb shell for overview/project navigation.",
    },
    {
      ok: htmlSource.includes('id="canvasContextMeta"'),
      message: "Canvas view should expose a metadata area for the active canvas context.",
    },
    {
      ok: htmlSource.includes('id="canvasConnections"'),
      message: "Canvas view should expose an SVG connection layer.",
    },
    {
      ok: appSource.includes("data-project-id"),
      message: "Project rows should render data-project-id hooks for navigation.",
    },
    {
      ok: appSource.includes("openProjectCanvas"),
      message: "App logic should define project-to-canvas navigation behavior.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Project canvas UI markers are present.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
