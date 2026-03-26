import http from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";
import { studioData } from "./studio-data.mjs";

const ROOT_DIR = process.cwd();

function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, ".env");

  try {
    const source = readFileSync(envPath, "utf8");
    const lines = source.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 4173);
const MODEL = process.env.OPENAI_MODEL || "gpt-5";
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
  });
  response.end(body);
}

function safeFilePath(requestPath) {
  const pathname = requestPath === "/" ? "/index.html" : requestPath;
  const resolvedPath = path.resolve(ROOT_DIR, `.${pathname}`);
  const resolvedRoot = path.resolve(ROOT_DIR);

  if (!resolvedPath.startsWith(resolvedRoot)) {
    throw new Error("Invalid path");
  }

  return resolvedPath;
}

async function parseJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function buildDeveloperPrompt() {
  const portfolioSnapshot = {
    studio: studioData.studio,
    assistant: studioData.assistant,
    projects: studioData.projects.map(({ canvas, ...project }) => project),
    assets: studioData.assets,
  };

  return [
    "You are the portfolio assistant for ZM Studio.",
    "Answer only from the studio data provided below.",
    "Do not invent projects, locations, budgets, team members, or deliverables.",
    "If a requested detail is missing from the data, say that the current portfolio data does not include it.",
    "Prefer concise, direct answers with light formatting.",
    "Match the user's language when possible.",
    "",
    "Studio data:",
    JSON.stringify(portfolioSnapshot, null, 2),
  ].join("\n");
}

function normalizeMessages(input) {
  if (!Array.isArray(input)) return [];

  return input
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content.trim().slice(0, 4000),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-12);
}

function extractResponseText(apiResponse) {
  if (typeof apiResponse.output_text === "string" && apiResponse.output_text.trim()) {
    return apiResponse.output_text.trim();
  }

  const outputs = Array.isArray(apiResponse.output) ? apiResponse.output : [];
  for (const item of outputs) {
    if (!Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
    }
  }

  return "";
}

async function handleChat(request, response) {
  if (!client) {
    sendJson(response, 503, {
      error: "OPENAI_API_KEY is not configured on the server. Add it to your environment and restart the app.",
    });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(request);
  } catch {
    sendJson(response, 400, { error: "Request body must be valid JSON." });
    return;
  }

  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    sendJson(response, 400, { error: "At least one chat message is required." });
    return;
  }

  try {
    const apiResponse = await client.responses.create({
      model: MODEL,
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: buildDeveloperPrompt(),
            },
          ],
        },
        ...messages.map((message) => ({
          role: message.role,
          content: [
            {
              type: "input_text",
              text: message.content,
            },
          ],
        })),
      ],
    });

    const reply = extractResponseText(apiResponse);
    if (!reply) {
      throw new Error("OpenAI returned an empty response.");
    }

    sendJson(response, 200, {
      reply,
      model: MODEL,
    });
  } catch (error) {
    sendJson(response, 502, {
      error:
        error instanceof Error
          ? `OpenAI request failed: ${error.message}`
          : "OpenAI request failed.",
    });
  }
}

async function handleStatic(requestPath, response) {
  try {
    const filePath = safeFilePath(requestPath);
    const body = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";

    response.writeHead(200, { "content-type": contentType });
    response.end(body);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      sendText(response, 404, "Not Found");
      return;
    }
    sendText(response, 500, "Internal Server Error");
  }
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, "Bad Request");
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/studio-data") {
    sendJson(response, 200, {
      studio: studioData.studio,
      assistant: studioData.assistant,
      projects: studioData.projects,
      assets: studioData.assets,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/chat") {
    await handleChat(request, response);
    return;
  }

  if (request.method === "GET") {
    await handleStatic(url.pathname, response);
    return;
  }

  sendText(response, 405, "Method Not Allowed");
});

server.listen(PORT, () => {
  console.log(`ZM Studio server running at http://127.0.0.1:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
