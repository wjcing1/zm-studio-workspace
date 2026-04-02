import { spawn } from "node:child_process";
import process from "node:process";

const PORT = 4322;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const STREAM_TEXT = "这是一个用于工作区 AI 流式回归测试的响应。";
const STREAM_OPERATIONS = [
  {
    type: "addNode",
    node: {
      id: "stream-node-1",
      type: "text",
      x: 120,
      y: 160,
      w: 280,
      h: "auto",
      content: "Added from streaming workspace stub",
    },
  },
];

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

    const streamingServer = spawn("node", ["server.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT + 1),
        MINIMAX_API_KEY: "",
        WORKSPACE_ASSISTANT_STREAM_TEST_MODE: "1",
        WORKSPACE_ASSISTANT_STREAM_TEST_TEXT: STREAM_TEXT,
        WORKSPACE_ASSISTANT_STREAM_TEST_OPERATIONS_JSON: JSON.stringify(STREAM_OPERATIONS),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let streamingStderr = "";
    streamingServer.stderr.on("data", (chunk) => {
      streamingStderr += chunk.toString();
    });

    try {
      await waitForServer(`http://127.0.0.1:${PORT + 1}/`);

      const streamResponse = await fetch(`http://127.0.0.1:${PORT + 1}/api/workspace-assistant`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          stream: true,
          messages: [{ role: "user", content: "请边说边整理当前画布。" }],
          board: {
            title: "Verify Board",
            nodes: [{ id: "node-1", type: "text", content: "Alpha" }],
            edges: [],
          },
          pointer: { x: 100, y: 100 },
        }),
      });

      if (streamResponse.status !== 200) {
        throw new Error(
          `/api/workspace-assistant stream mode should return 200 in test stub mode, got ${streamResponse.status}`,
        );
      }

      const contentType = streamResponse.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        throw new Error(
          `/api/workspace-assistant stream mode should use text/event-stream, got ${contentType || "<none>"}`,
        );
      }

      const events = await readSseEvents(streamResponse);
      const chunkEvents = events.filter((event) => event?.type === "chunk");
      const doneEvent = events.find((event) => event?.type === "done");

      if (chunkEvents.length < 2) {
        throw new Error(`/api/workspace-assistant stream mode should emit multiple chunk events, got ${chunkEvents.length}`);
      }

      if (!doneEvent) {
        throw new Error("/api/workspace-assistant stream mode should terminate with a done event.");
      }

      if (!Array.isArray(doneEvent.operations) || doneEvent.operations.length !== 1) {
        throw new Error("/api/workspace-assistant stream mode should include final workspace operations in the done event.");
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
