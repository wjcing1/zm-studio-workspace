import { execFileSync, spawn } from "node:child_process";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const SESSION_A = `rtca_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const SESSION_B = `rtcb_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
const PORT = 4176;
const PAGE_URL = `http://127.0.0.1:${PORT}/workspace.html`;

function runPw(session, args) {
  return execFileSync(PWCLI, [`-s=${session}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
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

function evalJson(script) {
  return {
    in(session) {
      return extractJsonResult(runPw(session, ["eval", script]));
    },
  };
}

async function openPwSession(session, url, attempts = 4) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return runPw(session, ["open", url]);
    } catch (error) {
      lastError = error;
      const message = String(error?.stderr || error?.message || error);

      if (!/Session closed|EADDRINUSE|Daemon process exited/.test(message) || attempt === attempts) {
        throw error;
      }

      try {
        runPw(session, ["close"]);
      } catch {}

      await wait(250);
    }
  }

  throw lastError;
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
          MINIMAX_API_KEY: "",
        },
        stdio: "ignore",
      });

      await waitForServer(PAGE_URL);
    }

    await openPwSession(SESSION_A, PAGE_URL);
    await openPwSession(SESSION_B, PAGE_URL);

    const waitForConnected = `async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let index = 0; index < 40; index += 1) {
        const status = window.__workspaceCollaboration?.status || document.getElementById("collaborationStatus")?.dataset?.state || "";
        if (status === "connected") {
          return { connected: true, status };
        }
        await wait(150);
      }
      return {
        connected: false,
        status: window.__workspaceCollaboration?.status || document.getElementById("collaborationStatus")?.dataset?.state || "",
      };
    }`;

    const firstConnected = evalJson(waitForConnected).in(SESSION_A);
    const secondConnected = evalJson(waitForConnected).in(SESSION_B);

    if (!firstConnected.connected || !secondConnected.connected) {
      throw new Error(
        `Both workspace tabs should establish realtime collaboration. Tab A: ${firstConnected.status || "unknown"} Tab B: ${secondConnected.status || "unknown"}`,
      );
    }

    const interaction = evalJson(`async () => {
      const textarea = document.querySelector('.canvas-textarea[data-text-node="intro"]');
      const viewport = document.getElementById("canvasViewport");
      if (!textarea || !viewport) {
        return { ok: false, reason: "missing-canvas-target" };
      }

      const rect = textarea.getBoundingClientRect();
      const clientX = rect.left + 24;
      const clientY = rect.top + 24;

      viewport.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          pointerId: 7,
          pointerType: "mouse",
        }),
      );

      textarea.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          pointerId: 7,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
        }),
      );

      textarea.focus();
      textarea.value = textarea.value + "\\nPresence test";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));

      await new Promise((resolve) => setTimeout(resolve, 500));

      return {
        ok: true,
        selectedNodeId: document.querySelector(".canvas-node.is-selected")?.dataset?.id || null,
        focused: document.activeElement === textarea,
      };
    }`).in(SESSION_B);

    if (!interaction.ok) {
      throw new Error(`Presence setup interaction failed: ${interaction.reason || "unknown error"}`);
    }

    if (!interaction.focused) {
      throw new Error("The collaborator tab should focus the intro text node before presence is checked.");
    }

    const presence = evalJson(`async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      for (let index = 0; index < 40; index += 1) {
        const result = {
          cursorCount: document.querySelectorAll(".collaboration-cursor").length,
          selectionCount: document.querySelectorAll('.collaboration-selection[data-node-id="intro"]').length,
          editingCount: document.querySelectorAll('.collaboration-editing-badge[data-node-id="intro"]').length,
          remotePeerCount: window.__workspaceCollaboration?.remotePeerCount || 0,
        };

        if (result.cursorCount > 0 && result.selectionCount > 0 && result.editingCount > 0) {
          return result;
        }

        await wait(200);
      }

      return {
        cursorCount: document.querySelectorAll(".collaboration-cursor").length,
        selectionCount: document.querySelectorAll('.collaboration-selection[data-node-id="intro"]').length,
        editingCount: document.querySelectorAll('.collaboration-editing-badge[data-node-id="intro"]').length,
        remotePeerCount: window.__workspaceCollaboration?.remotePeerCount || 0,
      };
    }`).in(SESSION_A);

    if (presence.cursorCount < 1) {
      throw new Error("Remote collaborator cursors should be rendered in the local workspace.");
    }

    if (presence.selectionCount < 1) {
      throw new Error("Remote collaborator selections should be rendered around shared nodes.");
    }

    if (presence.editingCount < 1) {
      throw new Error("Remote collaborator editing badges should appear while another user is typing.");
    }

    console.log("PASS: realtime collaboration presence UI is valid.");
  } finally {
    try {
      runPw(SESSION_A, ["close"]);
    } catch {}

    try {
      runPw(SESSION_B, ["close"]);
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
