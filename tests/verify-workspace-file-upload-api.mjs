import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PORT = 4325;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const STORE_DIR = path.join(process.cwd(), ".tmp", `board-store-${PORT}`);
const UPLOAD_DIR = path.join(process.cwd(), ".tmp", `uploads-${PORT}`);
const SVG_SOURCE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" rx="16" fill="#111"/><circle cx="40" cy="40" r="18" fill="#7dd3fc"/><rect x="64" y="22" width="28" height="36" rx="8" fill="#fef08a"/></svg>';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
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
    await waitForServer(`${BASE_URL}/`);

    const uploadResponse = await fetch(`${BASE_URL}/api/uploads`, {
      method: "POST",
      headers: {
        "content-type": "image/svg+xml",
        "x-board-key": "overview",
        "x-file-name": "moodboard.svg",
      },
      body: SVG_SOURCE,
    });

    if (!uploadResponse.ok) {
      throw new Error(`/api/uploads should return 201, got ${uploadResponse.status}`);
    }

    const payload = await uploadResponse.json();
    const upload = payload?.upload;

    if (!upload?.url || !upload.url.startsWith("/")) {
      throw new Error("Upload response should include a retrievable root-relative URL.");
    }

    if (upload.boardKey !== "overview") {
      throw new Error(`Upload response should preserve the board key. Got ${upload.boardKey}`);
    }

    if (upload.originalName !== "moodboard.svg") {
      throw new Error(`Upload response should preserve the original file name. Got ${upload.originalName}`);
    }

    if (upload.mimeType !== "image/svg+xml") {
      throw new Error(`Upload response should preserve the MIME type. Got ${upload.mimeType}`);
    }

    if (upload.fileKind !== "image") {
      throw new Error(`SVG uploads should be recognized as image files. Got ${upload.fileKind}`);
    }

    if (typeof upload.size !== "number" || upload.size <= 0) {
      throw new Error(`Upload response should report a positive file size. Got ${upload.size}`);
    }

    const staticResponse = await fetch(`${BASE_URL}${upload.url}`);
    if (!staticResponse.ok) {
      throw new Error(`Uploaded file URL should be retrievable. Got ${staticResponse.status}`);
    }

    const staticBody = await staticResponse.text();
    if (!staticBody.includes("<svg")) {
      throw new Error("Uploaded file URL should return the stored file body.");
    }

    console.log("PASS: workspace upload API stores a file and returns retrievable metadata.");
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
