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

  const trimmedSplash = splashSource.trimStart();

  const checks = [
    {
      ok: indexSource.includes('url=./开屏动画.html'),
      message: "index.html should redirect visitors into 开屏动画.html first.",
    },
    {
      ok: trimmedSplash.startsWith("<!DOCTYPE html>"),
      message: "开屏动画.html must be a real standalone HTML document.",
    },
    {
      ok: !trimmedSplash.startsWith("import React"),
      message: "开屏动画.html must not begin with raw React source.",
    },
    {
      ok: splashSource.includes('data-page="zm-splash"'),
      message: "开屏动画.html should expose the splash page marker.",
    },
    {
      ok: splashSource.includes('id="splashCanvas"'),
      message: "开屏动画.html should provide the canvas mount for the intro animation.",
    },
    {
      ok: splashSource.includes('id="enterStudioButton"'),
      message: "开屏动画.html should expose the enter button hook.",
    },
    {
      ok: /<script type="module" src="\.\/splash\.js(?:\?v=[^"]+)?"><\/script>/.test(splashSource),
      message: "开屏动画.html should load the dedicated splash.js module.",
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
      ok: splashSource.includes('data-target-page="./login.html"'),
      message: "开屏动画.html should target login.html as the next page after the intro.",
    },
    {
      ok: splashSource.includes('href="./login.html"'),
      message: "开屏动画.html should link into login.html.",
    },
    {
      ok: scriptSource.includes("./login.html"),
      message: "splash.js should navigate into login.html after the intro.",
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
