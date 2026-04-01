import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PORT = 4321;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = path.join(process.cwd(), ".tmp", `chat-api-${PORT}.sqlite`);
const STREAM_TEST_TEXT = "这是一个用于项目页回归测试的流式响应。";

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

async function readSseEvents(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    throw new Error("Streaming response did not expose a readable body.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];

  let doneEventSeen = false;

  while (!doneEventSeen) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex).trim();
      buffer = buffer.slice(separatorIndex + 2);

      if (block.startsWith("data:")) {
        const event = JSON.parse(block.slice(5).trim());
        events.push(event);
        if (event?.type === "done") {
          doneEventSeen = true;
          break;
        }
      }

      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  return events;
}

async function main() {
  await rm(DB_PATH, { force: true });

  const server = spawn("node", ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      MINIMAX_API_KEY: "",
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

    const dataResponse = await fetch(`${BASE_URL}/api/studio-data`);
    if (!dataResponse.ok) {
      throw new Error(`/api/studio-data returned ${dataResponse.status}`);
    }

    const data = await dataResponse.json();
    if (data?.meta?.provider !== "sqlite") {
      throw new Error("/api/studio-data should report sqlite as the active provider for chat bootstrapping.");
    }

    if (!Array.isArray(data.projects) || !Array.isArray(data.assets)) {
      throw new Error("/api/studio-data did not return projects and assets arrays");
    }

    if (!existsSync(DB_PATH)) {
      throw new Error("Chat API startup should initialize the configured sqlite database file.");
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

    const streamingServer = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT + 1),
        MINIMAX_API_KEY: "",
        STUDIO_DB_PATH: `${DB_PATH}.stream.sqlite`,
        CHAT_STREAM_TEST_MODE: "1",
        CHAT_STREAM_TEST_TEXT: STREAM_TEST_TEXT,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let streamingStderr = "";
    streamingServer.stderr.on("data", (chunk) => {
      streamingStderr += chunk.toString();
    });

    try {
      await waitForServer(`http://127.0.0.1:${PORT + 1}/`);

      const streamResponse = await fetch(`http://127.0.0.1:${PORT + 1}/api/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          stream: true,
          messages: [{ role: "user", content: "请流式返回一个项目建议摘要。" }],
        }),
      });

      if (streamResponse.status !== 200) {
        throw new Error(`/api/chat stream mode should return 200 in test stub mode, got ${streamResponse.status}`);
      }

      const contentType = streamResponse.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        throw new Error(`/api/chat stream mode should use text/event-stream, got ${contentType || "<none>"}`);
      }

      const events = await readSseEvents(streamResponse);
      const chunkEvents = events.filter((event) => event?.type === "chunk");
      const doneEvent = events.find((event) => event?.type === "done");

      if (chunkEvents.length < 2) {
        throw new Error(`/api/chat stream mode should emit multiple chunk events, got ${chunkEvents.length}`);
      }

      if (!doneEvent) {
        throw new Error("/api/chat stream mode should terminate with a done event.");
      }
    } finally {
      streamingServer.kill("SIGTERM");
      await wait(300);
      if (streamingServer.exitCode === null) {
        streamingServer.kill("SIGKILL");
      }
      if (streamingStderr.trim()) {
        process.stderr.write(streamingStderr);
      }
      await rm(`${DB_PATH}.stream.sqlite`, { force: true });
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
    await rm(DB_PATH, { force: true });
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
