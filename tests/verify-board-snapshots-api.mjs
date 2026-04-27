import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PORT = 4324;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const STORE_DIR = path.join(process.cwd(), ".tmp", `board-store-${PORT}`);
const DB_PATH = path.join(process.cwd(), ".tmp", `board-store-${PORT}.sqlite`);

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
  await rm(DB_PATH, { force: true });

  const server = spawn("node", ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      OPENAI_API_KEY: "",
      COLLAB_MODE: "server",
      COLLAB_PROVIDER: "local-file",
      BOARD_STORE_DIR: STORE_DIR,
      STUDIO_DB_PATH: DB_PATH,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(`${BASE_URL}/`);

    const seededResponse = await fetch(`${BASE_URL}/api/boards/overview`);
    if (!seededResponse.ok) {
      throw new Error(`/api/boards/overview should return 200, got ${seededResponse.status}`);
    }

    const seededPayload = await seededResponse.json();
    if (seededPayload.board?.key !== "overview") {
      throw new Error("Seeded overview board did not include the expected board key.");
    }

    if (seededPayload.persistence?.provider !== "sqlite") {
      throw new Error("Seeded overview board should report sqlite persistence.");
    }

    if (!Array.isArray(seededPayload.board?.nodes) || seededPayload.board.nodes.length === 0) {
      throw new Error("Seeded overview board did not include any nodes.");
    }

    const saveResponse = await fetch(`${BASE_URL}/api/boards/overview`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        board: {
          key: "overview",
          title: "Studio Canvas",
          description: "Server-saved overview board",
          camera: { x: 144, y: 110, z: 0.91 },
          nodes: [
            {
              id: "sync-note",
              type: "text",
              x: 240,
              y: 220,
              w: 340,
              h: "auto",
              content: "Shared board note",
            },
          ],
          edges: [],
        },
      }),
    });

    if (!saveResponse.ok) {
      throw new Error(`/api/boards/overview PUT should return 200, got ${saveResponse.status}`);
    }

    const savedPayload = await saveResponse.json();
    if (savedPayload.board?.description !== "Server-saved overview board") {
      throw new Error("Saved board response did not include the updated description.");
    }

    const reloadedResponse = await fetch(`${BASE_URL}/api/boards/overview`);
    if (!reloadedResponse.ok) {
      throw new Error(`/api/boards/overview reload should return 200, got ${reloadedResponse.status}`);
    }

    const reloadedPayload = await reloadedResponse.json();
    if (reloadedPayload.board?.nodes?.[0]?.content !== "Shared board note") {
      throw new Error("Reloaded board did not return the server-saved snapshot.");
    }

    if (!existsSync(DB_PATH)) {
      throw new Error("Board snapshot API should initialize the configured sqlite database file.");
    }

    const legacyJsonPath = path.join(STORE_DIR, "overview.json");
    if (existsSync(legacyJsonPath)) {
      throw new Error("Board snapshot API should no longer persist overview snapshots as JSON files.");
    }

    const projectResponse = await fetch(`${BASE_URL}/api/boards/PRJ-001`);
    if (!projectResponse.ok) {
      throw new Error(`/api/boards/PRJ-001 should return 200, got ${projectResponse.status}`);
    }

    const projectPayload = await projectResponse.json();
    if (projectPayload.board?.projectId !== "PRJ-001") {
      throw new Error("Project board response did not include the matching projectId.");
    }

    console.log("PASS: board snapshots API contract is valid.");
  } finally {
    server.kill("SIGTERM");
    await wait(300);
    if (server.exitCode === null) {
      server.kill("SIGKILL");
    }
    await rm(STORE_DIR, { recursive: true, force: true });
    await rm(DB_PATH, { force: true });
    if (stderr.trim()) {
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
