import { spawn } from "node:child_process";
import process from "node:process";

const PORT = 4322;
const BASE_URL = `http://127.0.0.1:${PORT}`;

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
  const server = spawn("node", ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      MINIMAX_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(`${BASE_URL}/`);

    const response = await fetch(`${BASE_URL}/api/workspace-assistant`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "帮我整理一下这里的节点" }],
        board: {
          title: "Verify Board",
          nodes: [{ id: "node-1", type: "text", content: "Alpha" }],
          edges: [],
        },
        pointer: { x: 100, y: 100 },
      }),
    });

    if (response.status !== 503) {
      throw new Error(
        `/api/workspace-assistant should return 503 without MINIMAX_API_KEY, got ${response.status}`,
      );
    }

    const payload = await response.json();
    if (!payload.error || !String(payload.error).includes("MINIMAX_API_KEY")) {
      throw new Error("/api/workspace-assistant missing-key response did not explain MINIMAX_API_KEY configuration");
    }

    console.log("PASS: workspace AI API contract is valid.");
  } finally {
    server.kill("SIGTERM");
    await wait(300);
    if (server.exitCode === null) {
      server.kill("SIGKILL");
    }
    if (stderr.trim()) {
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
