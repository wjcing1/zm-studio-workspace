import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION = `wwchl_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PORT = 4173;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html?codex-test-auth=1`;

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${SESSION}`, ...args], {
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await wait(250);
  }

  throw new Error(`Server did not become ready at ${url}`);
}

async function main() {
  let server = null;

  try {
    try {
      runPw(["kill-all"]);
    } catch {}

    try {
      await waitForServer(PAGE_URL, 4);
    } catch {
      server = spawn("node", ["server.mjs"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(PORT),
          MINIMAX_API_KEY: "",
        },
        stdio: "ignore",
      });

      await waitForServer(PAGE_URL);
    }

    runPw(["open", PAGE_URL]);

    const result = extractJsonResult(
      runPw([
        "eval",
        `async () => {
          await new Promise((resolve) => setTimeout(resolve, 700));
          const viewport = document.getElementById("canvasViewport");
          const workspaceCanvasApp = document.getElementById("workspaceCanvasApp");
          if (!viewport || !workspaceCanvasApp) {
            return { ok: false, reason: "missing-workspace-layers" };
          }

          const appStyle = getComputedStyle(workspaceCanvasApp);

          return {
            ok: true,
            isTldrawPrimary: viewport.classList.contains("is-tldraw-primary"),
            opacity: appStyle.opacity,
            visibility: appStyle.visibility,
            pointerEvents: appStyle.pointerEvents,
          };
        }`,
      ]),
    );

    if (!result.ok) {
      throw new Error(`Compat workspace probe failed: ${result.reason || "unknown reason"}`);
    }

    if (result.isTldrawPrimary) {
      throw new Error("Plain workspace route should not force the tldraw-primary class in compat mode.");
    }

    if (result.opacity !== "0" || result.visibility !== "hidden") {
      throw new Error(
        `Compat workspace should hide the tldraw layer to avoid double-rendered cards. Opacity: ${result.opacity} Visibility: ${result.visibility}`,
      );
    }

    if (result.pointerEvents !== "none") {
      throw new Error(`Compat workspace should keep the hidden tldraw layer non-interactive. Pointer events: ${result.pointerEvents}`);
    }

    console.log("PASS: compat workspace hides the tldraw layer so only one canvas renderer is visible.");
  } finally {
    try {
      runPw(["close"]);
    } catch {}

    try {
      runPw(["kill-all"]);
    } catch {}

    if (server) {
      server.kill("SIGTERM");
      await wait(300);
      if (server.exitCode === null) {
        server.kill("SIGKILL");
      }
    }
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
