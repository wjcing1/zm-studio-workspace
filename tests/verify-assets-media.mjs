import { execFileSync } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wam_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PAGE_URL = "http://127.0.0.1:4173/assets.html";

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${SESSION}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15000,
  });
}

function extractJsonResult(output) {
  const match = output.match(/### Result\s+([\s\S]*?)\n### Ran Playwright code/);
  if (!match) {
    throw new Error(`Unable to parse Playwright output:\n${output}`);
  }
  return JSON.parse(match[1].trim());
}

try {
  try {
    runPw(["kill-all"]);
  } catch {}

  runPw(["open", PAGE_URL]);

  const result = runPw([
    "eval",
    `() => {
      return Array.from(document.querySelectorAll('.asset-card img')).map((img, index) => ({
        index,
        alt: img.alt,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        currentSrc: img.currentSrc
      }));
    }`,
  ]);

  const images = extractJsonResult(result);
  const broken = images.filter((image) => !image.complete || image.naturalWidth === 0);

  if (broken.length > 0) {
    console.error(
      `FAIL: asset images failed to load: ${JSON.stringify(broken, null, 2)}`,
    );
    process.exit(1);
  }

  console.log(`PASS: ${images.length} asset images loaded successfully.`);
} finally {
  try {
    runPw(["close"]);
  } catch {}

  try {
    runPw(["kill-all"]);
  } catch {}
}
