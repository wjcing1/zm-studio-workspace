import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const root = process.cwd();
  const [manifestSource, serviceWorkerSource, workspaceSource, assetsSource, projectsSource, sharedStylesSource, serverSource] = await Promise.all([
    readFile(path.join(root, "manifest.webmanifest"), "utf8"),
    readFile(path.join(root, "sw.js"), "utf8"),
    readFile(path.join(root, "workspace.html"), "utf8"),
    readFile(path.join(root, "assets.html"), "utf8"),
    readFile(path.join(root, "projects.html"), "utf8"),
    readFile(path.join(root, "styles/shared.css"), "utf8"),
    readFile(path.join(root, "server.mjs"), "utf8"),
  ]);

  const pageSources = [workspaceSource, assetsSource, projectsSource];
  const navBlock = [...sharedStylesSource.matchAll(/\.nav\s*\{[\s\S]*?\n\}/g)].map((match) => match[0]).find((block) => block.includes("display: inline-flex")) ?? "";
  const navLinkBlock = sharedStylesSource.match(/\.nav-link\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  const navLinkHoverBlock = sharedStylesSource.match(/\.nav-link:hover\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  const activeNavLinkBlock = sharedStylesSource.match(/\.nav-link\.is-active\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  const checks = [
    {
      ok: manifestSource.includes('"display": "standalone"'),
      message: "manifest.webmanifest should declare standalone display mode.",
    },
    {
      ok:
        manifestSource.includes('"start_url": "./index.html"') &&
        manifestSource.includes('"scope": "./"') &&
        manifestSource.includes('"src": "./icons/app-icon.svg"'),
      message: "manifest.webmanifest should use relative URLs so the app works from a GitHub Pages subpath.",
    },
    {
      ok: serviceWorkerSource.includes("workspace.html") && serviceWorkerSource.includes("assets.html"),
      message: "sw.js should cache the split page shell.",
    },
    {
      ok:
        assetsSource.includes('src="./scripts/shared/register-web-app.js"') ||
        /src="\.\/scripts\/assets-page\.js(?:\?v=[^"]+)?"/.test(assetsSource),
      message: "App pages should load Web App registration-capable scripts.",
    },
    {
      ok: projectsSource.includes('rel="manifest" href="./manifest.webmanifest"'),
      message: "Dedicated pages should link the web app manifest.",
    },
    {
      ok: pageSources.every((source) => !source.includes("Public beta access")),
      message: "Topbar pages should remove the Public beta access status copy.",
    },
    {
      ok: pageSources.every((source) => !source.includes('id="installAppBtn"') && !source.includes("Chrome 安装本地应用")),
      message: "Topbar pages should remove the Chrome install button.",
    },
    {
      ok: pageSources.every((source) => !source.includes('class="topbar-actions"')),
      message: "Topbar pages should no longer render an empty actions shell.",
    },
    {
      ok: sharedStylesSource.includes("margin-left: auto;"),
      message: "shared.css should push the three primary nav items to the right.",
    },
    {
      ok: pageSources.every((source) => source.includes('href="./styles/shared.css?v=')),
      message: "Topbar pages should version the shared stylesheet to avoid stale nav chrome.",
    },
    {
      ok:
        navBlock.includes("background: transparent;") &&
        navBlock.includes("border: 0;") &&
        navBlock.includes("backdrop-filter: none;") &&
        navBlock.includes("box-shadow: none;"),
      message: "shared.css should remove the outer nav bubble treatment.",
    },
    {
      ok:
        activeNavLinkBlock.includes("color: var(--text);") &&
        activeNavLinkBlock.includes("background: transparent;") &&
        navLinkHoverBlock.includes("background: transparent;"),
      message: "shared.css should highlight the active nav item without any hover or active bubble fill.",
    },
    {
      ok: !navLinkBlock.includes("transform 0.25s ease"),
      message: "shared.css should limit nav-link transitions to simple brightening instead of motion-heavy animation.",
    },
    {
      ok: serviceWorkerSource.includes('./styles/shared.css?v=${APP_VERSION}') && serviceWorkerSource.includes("new URL(asset, APP_BASE_URL)"),
      message: "sw.js should precache the versioned shared stylesheet from a relative GitHub Pages-safe base.",
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
