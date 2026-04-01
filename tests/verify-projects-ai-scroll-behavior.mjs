import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const PORT = 4194;
const PAGE_URL = `http://127.0.0.1:${PORT}/projects.html?codex-test-auth=1`;
let session = buildSessionId();

function buildSessionId() {
  return `pscroll_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
}

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${session}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  });
}

function isRetryablePlaywrightError(error) {
  const message = String(error?.stderr || error?.message || error || "");
  return /Session closed|EADDRINUSE|Daemon process exited|Browser '.*' is not open/.test(message);
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
      await waitForServer(PAGE_URL, 4);
    } catch {
      server = spawn("node", ["server.mjs"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(PORT),
        },
        stdio: "ignore",
      });

      await waitForServer(PAGE_URL);
    }

    try {
      runPw(["kill-all"]);
    } catch {}

    let result = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        try {
          runPw(["kill-all"]);
        } catch {}

        await wait(150);
        session = buildSessionId();
        runPw(["open", PAGE_URL]);

        result = extractJsonResult(
          runPw([
            "eval",
            `async () => {
              document.getElementById("projectsAssistantCompanion").click();
              const panel = document.getElementById("projectsAssistantPanel");
              const timeline = document.getElementById("projectsAssistantTimeline");
              const thread = document.getElementById("projectsAssistantMessages");
              const footer = document.getElementById("projectsAssistantFooter");
              thread.innerHTML = Array.from({ length: 12 }, (_, index) => (
                '<article class="assistant-message is-assistant"><div class="assistant-message-label">AI</div><div class="assistant-message-body">Message ' +
                (index + 1) +
                '<br />' +
                'detail '.repeat(80) +
                '</div></article>'
              )).join("");

              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

              const before = {
                timelineClientHeight: timeline.clientHeight,
                timelineScrollHeight: timeline.scrollHeight,
                timelineScrollTop: timeline.scrollTop,
                panelClientHeight: panel.clientHeight,
                panelScrollHeight: panel.scrollHeight,
                panelScrollTop: panel.scrollTop,
                footerBottom: footer.getBoundingClientRect().bottom,
                panelBottom: panel.getBoundingClientRect().bottom,
              };

              timeline.scrollTop = 240;
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

              const after = {
                timelineClientHeight: timeline.clientHeight,
                timelineScrollHeight: timeline.scrollHeight,
                timelineScrollTop: timeline.scrollTop,
                panelClientHeight: panel.clientHeight,
                panelScrollHeight: panel.scrollHeight,
                panelScrollTop: panel.scrollTop,
                footerBottom: footer.getBoundingClientRect().bottom,
                panelBottom: panel.getBoundingClientRect().bottom,
              };

              return { before, after };
            }`,
          ]),
        );
        break;
      } catch (error) {
        if (!isRetryablePlaywrightError(error) || attempt === 4) {
          throw error;
        }
        await wait(250);
      } finally {
        try {
          runPw(["close"]);
        } catch {}

        try {
          runPw(["kill-all"]);
        } catch {}
      }
    }

    if (result.before.timelineClientHeight <= 0) {
      throw new Error(
        `Projects AI timeline should reserve visible height. Got clientHeight=${result.before.timelineClientHeight}`,
      );
    }

    if (result.before.timelineScrollHeight <= result.before.timelineClientHeight) {
      throw new Error("Projects AI timeline should overflow with long message history.");
    }

    if (result.after.timelineScrollTop <= result.before.timelineScrollTop) {
      throw new Error("Projects AI timeline should scroll when the conversation is taller than the visible area.");
    }

    if (Math.abs(result.after.footerBottom - result.after.panelBottom) > 4) {
      throw new Error("Projects AI composer footer should remain pinned to the bottom of the panel while the timeline scrolls.");
    }

    console.log("PASS: Projects AI sheet keeps the composer fixed while the timeline scrolls.");
  } finally {
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
