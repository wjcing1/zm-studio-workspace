import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const root = process.cwd();
  const [serviceWorkerSource, assetsSource, workspaceSource, projectsSource] = await Promise.all([
    readFile(path.join(root, "sw.js"), "utf8"),
    readFile(path.join(root, "assets.html"), "utf8"),
    readFile(path.join(root, "workspace.html"), "utf8"),
    readFile(path.join(root, "projects.html"), "utf8"),
  ]);

  const checks = [
    {
      ok: !serviceWorkerSource.includes('const CACHE_NAME = "zm-studio-shell-v1"'),
      message: "sw.js should bump the app shell cache version after shell asset changes.",
    },
    {
      ok:
        serviceWorkerSource.includes('request.destination === "script"') &&
        serviceWorkerSource.includes('request.destination === "style"'),
      message: "sw.js should treat scripts and styles as refresh-sensitive shell assets.",
    },
    {
      ok: /href="\.\/styles\/assets\.css\?v=/.test(assetsSource),
      message: "assets.html should request a versioned assets.css URL to bypass stale shell caches.",
    },
    {
      ok: /src="\.\/scripts\/assets-page\.js\?v=/.test(assetsSource),
      message: "assets.html should request a versioned assets-page.js URL to bypass stale shell caches.",
    },
    {
      ok: /href="\.\/styles\/workspace\.css\?v=/.test(workspaceSource),
      message: "workspace.html should request a versioned workspace.css URL to bypass stale shell caches.",
    },
    {
      ok: /src="\.\/scripts\/workspace-page\.js\?v=/.test(workspaceSource),
      message: "workspace.html should request a versioned workspace-page.js URL to bypass stale shell caches.",
    },
    {
      ok: /href="\.\/styles\/projects\.css\?v=/.test(projectsSource),
      message: "projects.html should request a versioned projects.css URL to bypass stale shell caches.",
    },
    {
      ok: /src="\.\/scripts\/projects-page\.js\?v=/.test(projectsSource),
      message: "projects.html should request a versioned projects-page.js URL to bypass stale shell caches.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Web app cache refresh strategy is in place.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
