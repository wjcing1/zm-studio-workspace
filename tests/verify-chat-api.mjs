import { spawn } from "node:child_process";
import process from "node:process";

const PORT = 4321;
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

    const dataResponse = await fetch(`${BASE_URL}/api/studio-data`);
    if (!dataResponse.ok) {
      throw new Error(`/api/studio-data returned ${dataResponse.status}`);
    }

    const data = await dataResponse.json();
    if (!Array.isArray(data.projects) || !Array.isArray(data.assets)) {
      throw new Error("/api/studio-data did not return projects and assets arrays");
    }

    const chatResponse = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "你都做过什么项目？" }],
      }),
    });

    if (chatResponse.status !== 503) {
      throw new Error(`/api/chat should return 503 without MINIMAX_API_KEY, got ${chatResponse.status}`);
    }

    const payload = await chatResponse.json();
    if (!payload.error || !String(payload.error).includes("MINIMAX_API_KEY")) {
      throw new Error("/api/chat missing-key response did not explain MINIMAX_API_KEY configuration");
    }

    console.log("PASS: chat API contract is valid.");
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
