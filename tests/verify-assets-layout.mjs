import { execFileSync } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `verify_assets_layout_${process.pid}`;
const PAGE_URL = "http://127.0.0.1:4173/assets.html";
const MIN_CARD_HEIGHT = 160;

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
  runPw(["open", PAGE_URL]);

  const result = runPw([
    "eval",
    `() => {
      return Array.from(document.querySelectorAll('.asset-card')).map((node, index) => ({
        index,
        title: node.querySelector('.asset-title')?.textContent?.trim() || \`card-\${index}\`,
        height: Math.round(node.getBoundingClientRect().height),
        scrollHeight: Math.round(node.scrollHeight)
      }));
    }`,
  ]);

  const cards = extractJsonResult(result);
  const broken = cards.filter(
    (card) => card.height < MIN_CARD_HEIGHT || card.scrollHeight > card.height,
  );

  if (broken.length > 0) {
    console.error(
      `FAIL: asset cards have broken layout: ${JSON.stringify(broken, null, 2)}`,
    );
    process.exit(1);
  }

  console.log(`PASS: ${cards.length} asset cards meet layout bounds.`);
} finally {
  try {
    runPw(["close"]);
  } catch {}
}
