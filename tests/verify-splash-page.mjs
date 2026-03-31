import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const root = process.cwd();
  const indexPath = path.join(root, "index.html");
  const splashPath = path.join(root, "开屏动画.html");
  const scriptPath = path.join(root, "splash.js");

  const [indexSource, splashSource] = await Promise.all([
    readFile(indexPath, "utf8"),
    readFile(splashPath, "utf8"),
  ]);
  let scriptSource = "";

  try {
    scriptSource = await readFile(scriptPath, "utf8");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const trimmedIndex = indexSource.trimStart();
  const trimmedSplash = splashSource.trimStart();

  const checks = [
    {
      ok: trimmedIndex.startsWith("<!DOCTYPE html>"),
      message: "index.html must now be the real standalone splash HTML document.",
    },
    {
      ok: indexSource.includes('data-page="zm-splash"'),
      message: "index.html should expose the splash page marker directly.",
    },
    {
      ok: indexSource.includes('id="splashCanvas"'),
      message: "index.html should provide the canvas mount for the intro animation.",
    },
    {
      ok: indexSource.includes('id="enterStudioButton"'),
      message: "index.html should expose the enter button hook.",
    },
    {
      ok: /<script type="module" src="\.\/splash\.js(?:\?v=[^"]+)?"><\/script>/.test(indexSource),
      message: "index.html should load the dedicated splash.js module.",
    },
    {
      ok: scriptSource.length > 0,
      message: "splash.js should exist as the dedicated animation and navigation module.",
    },
    {
      ok: scriptSource.includes("requestAnimationFrame"),
      message: "splash.js should drive the animation loop with requestAnimationFrame.",
    },
    {
      ok: indexSource.includes('data-target-page="./login.html"'),
      message: "index.html should target login.html as the next page after the intro.",
    },
    {
      ok: indexSource.includes('href="./login.html"'),
      message: "index.html should link into login.html.",
    },
    {
      ok: scriptSource.includes("./login.html"),
      message: "splash.js should navigate into login.html after the intro.",
    },
    {
      ok: trimmedSplash.startsWith("<!DOCTYPE html>"),
      message: "开屏动画.html should remain a standalone HTML document for legacy links.",
    },
    {
      ok: splashSource.includes('url=./index.html'),
      message: "开屏动画.html should forward legacy links into index.html.",
    },
    {
      ok: splashSource.includes('href="./index.html"'),
      message: "开屏动画.html should provide a clickable fallback link to index.html.",
    },
    {
      ok: !splashSource.includes('data-page="zm-splash"'),
      message: "开屏动画.html should no longer be the primary splash document.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Splash entry flow markers are present.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
