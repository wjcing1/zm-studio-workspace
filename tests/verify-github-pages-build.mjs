import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function assertExists(filePath, message) {
  try {
    await access(filePath);
  } catch {
    throw new Error(message);
  }
}

async function main() {
  const root = process.cwd();

  execFileSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
  });

  const mustExist = [
    "dist/index.html",
    "dist/login.html",
    "dist/workspace.html",
    "dist/projects.html",
    "dist/assets.html",
    "dist/data/studio-data.json",
    "dist/media/assets/dubai-booth-plan.png",
    "dist/开屏动画.html",
    "dist/sw.js",
    "dist/manifest.webmanifest",
    "dist/.nojekyll",
    "dist/icons/app-icon.svg",
  ];

  for (const relativePath of mustExist) {
    await assertExists(path.join(root, relativePath), `${relativePath} should exist after npm run build.`);
  }

  const [distManifest, workflowSource] = await Promise.all([
    readFile(path.join(root, "dist/manifest.webmanifest"), "utf8"),
    readFile(path.join(root, ".github/workflows/deploy-pages.yml"), "utf8"),
  ]);

  if (!distManifest.includes('"start_url": "./index.html"')) {
    throw new Error("dist manifest should preserve the relative GitHub Pages start_url.");
  }

  if (!workflowSource.includes("actions/deploy-pages")) {
    throw new Error("GitHub Pages workflow should deploy with actions/deploy-pages.");
  }

  console.log("PASS: GitHub Pages build output and workflow are ready.");
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
