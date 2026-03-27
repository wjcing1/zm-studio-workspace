import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const root = process.cwd();
  const [manifestSource, serviceWorkerSource, assetsSource, projectsSource, serverSource] = await Promise.all([
    readFile(path.join(root, "manifest.webmanifest"), "utf8"),
    readFile(path.join(root, "sw.js"), "utf8"),
    readFile(path.join(root, "assets.html"), "utf8"),
    readFile(path.join(root, "projects.html"), "utf8"),
    readFile(path.join(root, "server.mjs"), "utf8"),
  ]);

  const checks = [
    {
      ok: manifestSource.includes('"display": "standalone"'),
      message: "manifest.webmanifest should declare standalone display mode.",
    },
    {
      ok: manifestSource.includes('"start_url": "/"'),
      message: "manifest.webmanifest should start from the site root.",
    },
    {
      ok: serviceWorkerSource.includes("workspace.html") && serviceWorkerSource.includes("assets.html"),
      message: "sw.js should cache the split page shell.",
    },
    {
      ok: assetsSource.includes('src="./scripts/shared/register-web-app.js"') || assetsSource.includes('src="./scripts/assets-page.js"'),
      message: "App pages should load Web App registration-capable scripts.",
    },
    {
      ok: projectsSource.includes('rel="manifest" href="./manifest.webmanifest"'),
      message: "Dedicated pages should link the web app manifest.",
    },
    {
      ok: serverSource.includes("application/manifest+json"),
      message: "server.mjs should serve manifest files with the correct MIME type.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Web App shell files are present and wired.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
