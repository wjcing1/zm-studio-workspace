import { spawn } from "node:child_process";
import process from "node:process";

const PORT = 4322;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ENCODED_SPLASH_PATH = "/%E5%BC%80%E5%B1%8F%E5%8A%A8%E7%94%BB.html";

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

    const response = await fetch(`${BASE_URL}${ENCODED_SPLASH_PATH}`);
    if (!response.ok) {
      throw new Error(`Encoded splash route should return 200, got ${response.status}`);
    }

    const html = await response.text();
    if (!html.includes('data-page="zm-splash"')) {
      throw new Error("Encoded splash route did not return the splash HTML document");
    }

    console.log("PASS: encoded splash route resolves to the splash page.");
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
