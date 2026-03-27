import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const htmlPath = path.join(process.cwd(), "workspace.html");
  const appPath = path.join(process.cwd(), "scripts", "workspace-page.js");
  const projectsPath = path.join(process.cwd(), "scripts", "projects-page.js");
  const [htmlSource, appSource, projectsSource] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(projectsPath, "utf8"),
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
      ok: projectsSource.includes("data-project-id"),
      message: "Projects page logic should render data-project-id hooks for navigation.",
    },
    {
      ok: appSource.includes("openProjectCanvas"),
      message: "App logic should define project-to-canvas navigation behavior.",
    },
    {
      ok: htmlSource.includes('href="./projects.html"'),
      message: "Workspace page should link to the dedicated projects page.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Workspace canvas UI markers are present.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
