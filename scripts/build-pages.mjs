import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const distDir = path.join(root, "dist");
const filesToCopy = [
  "index.html",
  "login.html",
  "workspace.html",
  "projects.html",
  "assets.html",
  "开屏动画.html",
  "222.html",
  "splash.js",
  "sw.js",
  "studio-data.mjs",
  "manifest.webmanifest",
];
const directoriesToCopy = ["icons", "styles", "scripts"];
const optionalFiles = ["CNAME"];

async function copyOptional(relativePath) {
  try {
    await access(path.join(root, relativePath));
    await cp(path.join(root, relativePath), path.join(distDir, relativePath));
  } catch {}
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const relativePath of filesToCopy) {
    await cp(path.join(root, relativePath), path.join(distDir, relativePath));
  }

  for (const relativePath of directoriesToCopy) {
    await cp(path.join(root, relativePath), path.join(distDir, relativePath), {
      recursive: true,
    });
  }

  await rm(path.join(distDir, "scripts", "build-pages.mjs"), { force: true });

  for (const relativePath of optionalFiles) {
    await copyOptional(relativePath);
  }

  const indexSource = await readFile(path.join(root, "index.html"), "utf8");
  await writeFile(path.join(distDir, "404.html"), indexSource);
  await writeFile(path.join(distDir, ".nojekyll"), "");

  console.log(`Built GitHub Pages artifact in ${distDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? `FAIL: ${error.message}` : "FAIL: unable to build Pages artifact.");
  process.exit(1);
});
