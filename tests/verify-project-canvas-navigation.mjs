import { execFileSync } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `verify_project_canvas_${process.pid}_${Date.now()}`;
const PAGE_URL = "http://127.0.0.1:4173/222.html";

function runPw(args) {
  return execFileSync(PWCLI, ["--session", SESSION, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20000,
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
      document.querySelector('[data-view-target="projects"]')?.click();
      const targetRow = document.querySelector('[data-project-id="PRJ-002"]');
      if (!targetRow) {
        return { ok: false, reason: 'missing-project-row' };
      }

      targetRow.click();

      const activeView = document.querySelector('.view.is-active')?.id || null;
      const breadcrumb = document.querySelector('#canvasBreadcrumb')?.textContent?.trim() || '';
      const title = document.querySelector('#canvasContextTitle')?.textContent?.trim() || '';
      const meta = document.querySelector('#canvasContextMeta')?.textContent?.trim() || '';
      const connectionCount = document.querySelectorAll('#canvasConnections line, #canvasConnections path').length;
      const projectNodeCount = document.querySelectorAll('.canvas-node[data-project-context="project"]').length;

      return {
        ok:
          activeView === 'canvas-view' &&
          breadcrumb.includes('Dark Matter E-commerce') &&
          title.includes('Dark Matter E-commerce') &&
          meta.includes('Milan') &&
          connectionCount > 0 &&
          projectNodeCount > 0,
        activeView,
        breadcrumb,
        title,
        meta,
        connectionCount,
        projectNodeCount,
      };
    }`,
  ]);

  const payload = extractJsonResult(result);

  if (!payload.ok) {
    console.error(`FAIL: project canvas navigation verification failed: ${JSON.stringify(payload, null, 2)}`);
    process.exit(1);
  }

  console.log("PASS: Project rows navigate to dedicated canvases with metadata and connections.");
} finally {
  try {
    runPw(["close"]);
  } catch {}
}
