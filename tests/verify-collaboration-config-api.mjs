import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PORT = 4323;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const STORE_DIR = path.join(process.cwd(), ".tmp", `board-store-${PORT}`);

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
  await rm(STORE_DIR, { recursive: true, force: true });

  const server = spawn("node", ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      MINIMAX_API_KEY: "",
      COLLAB_MODE: "server",
      COLLAB_PROVIDER: "local-file",
      BOARD_STORE_DIR: STORE_DIR,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(`${BASE_URL}/`);

    const response = await fetch(`${BASE_URL}/api/collaboration/config`);
    if (!response.ok) {
      throw new Error(`/api/collaboration/config should return 200, got ${response.status}`);
    }

    const payload = await response.json();

    if (payload.mode !== "server") {
      throw new Error(`Expected collaboration mode to be "server", got ${payload.mode}`);
    }

    if (payload.provider !== "local-file") {
      throw new Error(`Expected collaboration provider to be "local-file", got ${payload.provider}`);
    }

    if (!payload.features || payload.features.persistence !== true) {
      throw new Error("Collaboration config should advertise persistence support.");
    }

    if (payload.features.realtime !== true) {
      throw new Error("Collaboration config should default realtime to true once websocket sync is available.");
    }

    if (payload.features.presence !== true) {
      throw new Error("Collaboration config should default presence to true once awareness is available.");
    }

    if (payload.features.localCache !== true) {
      throw new Error("Collaboration config should keep local cache support enabled.");
    }

    if (payload.endpoints?.realtime !== "/api/collaboration/ws") {
      throw new Error(`Expected realtime endpoint to be \"/api/collaboration/ws\", got ${payload.endpoints?.realtime}`);
    }

    console.log("PASS: collaboration config API contract is valid.");
  } finally {
    server.kill("SIGTERM");
    await wait(300);
    if (server.exitCode === null) {
      server.kill("SIGKILL");
    }
    await rm(STORE_DIR, { recursive: true, force: true });
    if (stderr.trim()) {
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
