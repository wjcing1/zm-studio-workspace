import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const root = process.cwd();
  const [manifestSource, serviceWorkerSource, registerSource, assetsSource, workspaceSource, dataClientSource] = await Promise.all([
    readFile(path.join(root, "manifest.webmanifest"), "utf8"),
    readFile(path.join(root, "sw.js"), "utf8"),
    readFile(path.join(root, "scripts/shared/register-web-app.js"), "utf8"),
    readFile(path.join(root, "assets.html"), "utf8"),
    readFile(path.join(root, "workspace.html"), "utf8"),
    readFile(path.join(root, "scripts/shared/studio-data-client.js"), "utf8"),
  ]);

  const checks = [
    {
      ok: manifestSource.includes('"start_url": "./index.html"'),
      message: "manifest.webmanifest should use a relative start_url for GitHub Pages subpaths.",
    },
    {
      ok: manifestSource.includes('"scope": "./"'),
      message: "manifest.webmanifest should use a relative scope for GitHub Pages subpaths.",
    },
    {
      ok: manifestSource.includes('"src": "./icons/app-icon.svg"'),
      message: "manifest.webmanifest should use a relative icon path for GitHub Pages subpaths.",
    },
    {
      ok: registerSource.includes('navigator.serviceWorker.register("./sw.js")'),
      message: "Web app registration should use a relative service worker path.",
    },
    {
      ok: !serviceWorkerSource.includes('"/workspace.html"') && serviceWorkerSource.includes('new URL("./workspace.html"'),
      message: "sw.js should resolve navigation fallbacks from a relative base instead of the domain root.",
    },
    {
      ok: assetsSource.includes("AI requires a server backend"),
      message: "assets.html should explain that AI needs a backend when deployed statically.",
    },
    {
      ok: workspaceSource.includes("AI requires a server backend"),
      message: "workspace.html should explain that workspace AI needs a backend when deployed statically.",
    },
    {
      ok: dataClientSource.includes('fetch("/api/studio-data"'),
      message: "studio-data-client should prefer loading runtime data from /api/studio-data.",
    },
    {
      ok: dataClientSource.includes("./data/studio-data.json"),
      message: "studio-data-client should include a GitHub Pages static studio-data fallback.",
    },
    {
      ok: !dataClientSource.includes('from "../../studio-data.mjs"'),
      message: "studio-data-client should no longer import studio-data.mjs directly at browser runtime.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: GitHub Pages compatibility markers are in place.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
