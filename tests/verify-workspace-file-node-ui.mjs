import { execFileSync, spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME}/.codex`;
const PWCLI = `${CODEX_HOME}/skills/playwright/scripts/playwright_cli.sh`;
const PORT = 4326;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PAGE_URL = `${BASE_URL}/workspace.html?codex-test-auth=1`;
const STORE_DIR = path.join(process.cwd(), ".tmp", `board-store-${PORT}`);
const UPLOAD_DIR = path.join(process.cwd(), ".tmp", `uploads-${PORT}`);
let session = buildSessionId();

function buildSessionId() {
  return `wwf_${process.pid}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
}

function runPw(args) {
  return execFileSync(PWCLI, [`-s=${session}`, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 25000,
  });
}

function isRetryablePlaywrightError(error) {
  const message = String(error?.stderr || error?.message || error || "");
  return /Session closed|EADDRINUSE|Daemon process exited/.test(message);
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
  await Promise.all([
    rm(STORE_DIR, { recursive: true, force: true }),
    rm(UPLOAD_DIR, { recursive: true, force: true }),
  ]);

  const server = spawn("node", ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      MINIMAX_API_KEY: "",
      COLLAB_MODE: "server",
      COLLAB_PROVIDER: "local-file",
      BOARD_STORE_DIR: STORE_DIR,
      UPLOAD_STORE_DIR: UPLOAD_DIR,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(PAGE_URL);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        try {
          runPw(["kill-all"]);
        } catch {}

        session = buildSessionId();
        runPw(["open", PAGE_URL]);
        runPw([
          "eval",
          `() => {
            window.localStorage.removeItem("zm-studio-canvas:overview");
            return true;
          }`,
        ]);
        try {
          runPw(["close"]);
        } catch {}

        session = buildSessionId();
        runPw(["open", PAGE_URL]);

        const result = extractJsonResult(
          runPw([
            "eval",
            `async () => {
              const viewport = document.getElementById("canvasViewport");
              const stage = document.getElementById("canvasStage");
              const addFileNodeBtn = document.getElementById("addFileNodeBtn");
              const fileInput = document.getElementById("canvasFileInput");
              if (!viewport || !stage || !addFileNodeBtn || !fileInput) {
                return { ok: false, reason: "missing-file-controls" };
              }

              const viewportRect = viewport.getBoundingClientRect();
              const isBlocked = (point) =>
                document.elementsFromPoint(point.x, point.y).some((element) =>
                  element?.closest?.(
                    ".canvas-node, .canvas-context-shell, #canvasContextToggle, #canvasToolbar, #assistantCompanion, #workspaceAssistantPanel",
                  ),
                );

              let pointerPoint = null;
              for (let y = viewportRect.top + 150; y <= viewportRect.bottom - 120 && !pointerPoint; y += 70) {
                for (let x = viewportRect.left + 110; x <= viewportRect.right - 110; x += 70) {
                  const candidate = { x, y };
                  if (!isBlocked(candidate)) {
                    pointerPoint = candidate;
                    break;
                  }
                }
              }

              if (!pointerPoint) {
                return { ok: false, reason: "no-blank-canvas-space" };
              }

              viewport.dispatchEvent(
                new PointerEvent("pointermove", {
                  bubbles: true,
                  cancelable: true,
                  clientX: pointerPoint.x,
                  clientY: pointerPoint.y,
                  pointerId: 1,
                  pointerType: "mouse",
                }),
              );

              addFileNodeBtn.click();

              const file = new File(
                ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 100"><rect width="140" height="100" rx="20" fill="#101010"/><circle cx="48" cy="50" r="24" fill="#7dd3fc"/><rect x="82" y="28" width="26" height="44" rx="8" fill="#fef08a"/></svg>'],
                "moodboard.svg",
                { type: "image/svg+xml" },
              );
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              Object.defineProperty(fileInput, "files", {
                configurable: true,
                value: dataTransfer.files,
              });
              fileInput.dispatchEvent(new Event("change", { bubbles: true }));

              const waitForNode = async () => {
                const deadline = Date.now() + 5000;
                while (Date.now() < deadline) {
                  await new Promise((resolve) => setTimeout(resolve, 100));
                  const storedBoard = JSON.parse(window.localStorage.getItem("zm-studio-canvas:overview") || "null");
                  const fileNode = storedBoard?.nodes?.find((node) => node.type === "file") || null;
                  if (fileNode) {
                    const nodeElement = stage.querySelector(\`.canvas-node[data-id="\${fileNode.id}"]\`);
                    return {
                      storedNode: fileNode,
                      renderedType: nodeElement?.dataset?.nodeType || null,
                      hasPreviewImage: Boolean(nodeElement?.querySelector("img")),
                    };
                  }
                }

                return null;
              };

              const settled = await waitForNode();
              if (!settled) {
                return { ok: false, reason: "file-node-not-created" };
              }

              return {
                ok: true,
                storedType: settled.storedNode.type,
                storedTitle: settled.storedNode.title || "",
                storedFile: settled.storedNode.file || settled.storedNode.content || "",
                storedMimeType: settled.storedNode.mimeType || "",
                storedFileKind: settled.storedNode.fileKind || "",
                renderedType: settled.renderedType,
                hasPreviewImage: settled.hasPreviewImage,
              };
            }`,
          ]),
        );

        if (!result.ok) {
          throw new Error(`File node insertion probe failed: ${result.reason || "unknown reason"}`);
        }

        if (result.storedType !== "file") {
          throw new Error(`Inserted uploads should create file nodes. Got ${result.storedType}`);
        }

        if (result.storedTitle !== "moodboard.svg") {
          throw new Error(`File nodes should preserve the uploaded title. Got ${result.storedTitle}`);
        }

        if (!result.storedFile.startsWith("/")) {
          throw new Error(`File nodes should persist a retrievable file URL. Got ${result.storedFile}`);
        }

        if (result.storedMimeType !== "image/svg+xml") {
          throw new Error(`File nodes should preserve the MIME type. Got ${result.storedMimeType}`);
        }

        if (result.storedFileKind !== "image") {
          throw new Error(`SVG uploads should become image file nodes. Got ${result.storedFileKind}`);
        }

        if (result.renderedType !== "file") {
          throw new Error(`Inserted file nodes should render as file nodes. Got ${result.renderedType}`);
        }

        if (!result.hasPreviewImage) {
          throw new Error("Image file nodes should render an inline image preview.");
        }

        console.log("PASS: workspace canvas can insert and persist an uploaded image file node.");
        return;
      } catch (error) {
        if (!isRetryablePlaywrightError(error) || attempt === 2) {
          throw error;
        }
      } finally {
        try {
          runPw(["close"]);
        } catch {}

        try {
          runPw(["kill-all"]);
        } catch {}
      }
    }
  } finally {
    server.kill("SIGTERM");
    await wait(300);
    if (server.exitCode === null) {
      server.kill("SIGKILL");
    }
    await Promise.all([
      rm(STORE_DIR, { recursive: true, force: true }),
      rm(UPLOAD_DIR, { recursive: true, force: true }),
    ]);
    if (stderr.trim()) {
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
