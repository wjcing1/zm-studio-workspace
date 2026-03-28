import http from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";
import { createBoardStore } from "./board-store.mjs";
import { getCollaborationConfig } from "./collaboration-config.mjs";
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
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/v1";
const MODEL = process.env.MINIMAX_MODEL || "MiniMax-M2.7";
const collaborationConfig = getCollaborationConfig(process.env, ROOT_DIR);
const boardStore = createBoardStore({
  provider: collaborationConfig.provider,
  storageDir: collaborationConfig.storageDir,
});
const client = process.env.MINIMAX_API_KEY
  ? new OpenAI({
      apiKey: process.env.MINIMAX_API_KEY,
      baseURL: MINIMAX_BASE_URL,
    })
  : null;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
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
  let decodedPathname = pathname;

  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    throw new Error("Invalid path");
  }

  const resolvedPath = path.resolve(ROOT_DIR, `.${decodedPathname}`);
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

function extractChatText(completion) {
  const content = completion?.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.replace(/^<think>[\s\S]*?<\/think>\s*/i, "").trim();
  }

  if (Array.isArray(content)) {
    for (const item of content) {
      if (item?.type === "text" && typeof item.text === "string" && item.text.trim()) {
        return item.text.replace(/^<think>[\s\S]*?<\/think>\s*/i, "").trim();
      }
    }
  }

  return "";
}

function extractJsonObject(rawText) {
  const cleaned = String(rawText || "").trim();
  if (!cleaned) {
    throw new Error("The AI returned an empty payload.");
  }

  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : cleaned;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("The AI response did not contain a JSON object.");
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

function normalizeWorkspaceNode(node) {
  if (!node || typeof node !== "object") return null;

  return {
    id: typeof node.id === "string" ? node.id.slice(0, 120) : "",
    type: typeof node.type === "string" ? node.type.slice(0, 24) : "text",
    x: typeof node.x === "number" ? Math.round(node.x) : 0,
    y: typeof node.y === "number" ? Math.round(node.y) : 0,
    w: typeof node.w === "number" ? Math.round(node.w) : 280,
    h: typeof node.h === "number" ? Math.round(node.h) : node.h === "auto" ? "auto" : 180,
    title: typeof node.title === "string" ? node.title.slice(0, 200) : "",
    label: typeof node.label === "string" ? node.label.slice(0, 200) : "",
    content: typeof node.content === "string" ? node.content.slice(0, 1200) : "",
    url: typeof node.url === "string" ? node.url.slice(0, 500) : "",
    tags: Array.isArray(node.tags) ? node.tags.map((tag) => String(tag).slice(0, 60)).slice(0, 8) : [],
  };
}

function normalizeWorkspaceBody(body) {
  const board = body && typeof body.board === "object" ? body.board : {};
  const focus = body && typeof body.focus === "object" ? body.focus : {};

  return {
    board: {
      key: typeof board.key === "string" ? board.key.slice(0, 80) : "workspace",
      title: typeof board.title === "string" ? board.title.slice(0, 120) : "Workspace",
      description: typeof board.description === "string" ? board.description.slice(0, 800) : "",
      nodeCount: typeof board.nodeCount === "number" ? board.nodeCount : Array.isArray(board.nodes) ? board.nodes.length : 0,
      edgeCount: typeof board.edgeCount === "number" ? board.edgeCount : Array.isArray(board.edges) ? board.edges.length : 0,
      nodes: Array.isArray(board.nodes) ? board.nodes.slice(0, 40).map(normalizeWorkspaceNode).filter(Boolean) : [],
      edges: Array.isArray(board.edges)
        ? board.edges.slice(0, 60).map((edge) => ({
            id: typeof edge?.id === "string" ? edge.id.slice(0, 120) : "",
            from: typeof edge?.from === "string" ? edge.from.slice(0, 120) : "",
            to: typeof edge?.to === "string" ? edge.to.slice(0, 120) : "",
            label: typeof edge?.label === "string" ? edge.label.slice(0, 200) : "",
          }))
        : [],
    },
    focus: {
      pointer:
        focus.pointer && typeof focus.pointer === "object"
          ? {
              x: typeof focus.pointer.x === "number" ? Math.round(focus.pointer.x) : 0,
              y: typeof focus.pointer.y === "number" ? Math.round(focus.pointer.y) : 0,
            }
          : { x: 0, y: 0 },
      hoveredNode: normalizeWorkspaceNode(focus.hoveredNode),
      nearbyNodes: Array.isArray(focus.nearbyNodes) ? focus.nearbyNodes.slice(0, 10).map(normalizeWorkspaceNode).filter(Boolean) : [],
      selectedNodes: Array.isArray(focus.selectedNodes) ? focus.selectedNodes.slice(0, 10).map(normalizeWorkspaceNode).filter(Boolean) : [],
      connectedNodes: Array.isArray(focus.connectedNodes)
        ? focus.connectedNodes.slice(0, 12).map(normalizeWorkspaceNode).filter(Boolean)
        : [],
      visibleNodes: Array.isArray(focus.visibleNodes)
        ? focus.visibleNodes.slice(0, 12).map(normalizeWorkspaceNode).filter(Boolean)
        : [],
    },
  };
}

function buildWorkspaceAssistantPrompt(workspaceContext) {
  return [
    "You are the workspace canvas copilot for ZM Studio.",
    "You help the user think on a spatial canvas and you may directly modify the active board.",
    "Prioritize context in this order: hovered node, selected nodes, nearby nodes, connected nodes, visible nodes, then board summary.",
    "Return JSON only with this shape:",
    '{"reply":"short helpful response","operations":[{"type":"addNode","node":{}},{"type":"updateNode","id":"node-id","patch":{}},{"type":"removeNode","id":"node-id"},{"type":"addEdge","edge":{}},{"type":"removeEdge","id":"edge-id"}]}',
    "Allowed node types: text, link, group, image, project.",
    "For addNode include id, type, x, y, w, h and any relevant content fields.",
    "For addEdge include id, from, to, fromSide, toSide, and optional label.",
    "Never reference node IDs that do not exist when updating or removing.",
    "Prefer small, precise edits over rewriting the whole board.",
    "If the request is only analytical, return operations as an empty array.",
    "Match the user's language when possible.",
    "",
    "Workspace context:",
    JSON.stringify(workspaceContext, null, 2),
  ].join("\n");
}

function normalizeWorkspaceOperations(input) {
  if (!Array.isArray(input)) return [];

  return input
    .map((operation) => {
      const type = typeof operation?.type === "string" ? operation.type : "";

      if (type === "addNode" && operation?.node && typeof operation.node.id === "string") {
        return {
          type,
          node: {
            id: operation.node.id.slice(0, 120),
            type: typeof operation.node.type === "string" ? operation.node.type.slice(0, 24) : "text",
            x: typeof operation.node.x === "number" ? Math.round(operation.node.x) : 0,
            y: typeof operation.node.y === "number" ? Math.round(operation.node.y) : 0,
            w: typeof operation.node.w === "number" ? Math.max(120, Math.round(operation.node.w)) : 280,
            h:
              typeof operation.node.h === "number"
                ? Math.max(96, Math.round(operation.node.h))
                : operation.node.h === "auto"
                  ? "auto"
                  : 180,
            title: typeof operation.node.title === "string" ? operation.node.title.slice(0, 200) : "",
            label: typeof operation.node.label === "string" ? operation.node.label.slice(0, 200) : "",
            content: typeof operation.node.content === "string" ? operation.node.content.slice(0, 1200) : "",
            url: typeof operation.node.url === "string" ? operation.node.url.slice(0, 500) : "",
            tags: Array.isArray(operation.node.tags)
              ? operation.node.tags.map((tag) => String(tag).slice(0, 60)).slice(0, 8)
              : [],
          },
        };
      }

      if (type === "updateNode" && typeof operation?.id === "string" && operation?.patch && typeof operation.patch === "object") {
        const patch = {};
        for (const key of ["x", "y", "w", "h", "title", "label", "content", "url", "color"]) {
          if (!(key in operation.patch)) continue;
          patch[key] = operation.patch[key];
        }
        if (Array.isArray(operation.patch.tags)) {
          patch.tags = operation.patch.tags.map((tag) => String(tag).slice(0, 60)).slice(0, 8);
        }
        return {
          type,
          id: operation.id.slice(0, 120),
          patch,
        };
      }

      if (type === "removeNode" && typeof operation?.id === "string") {
        return {
          type,
          id: operation.id.slice(0, 120),
        };
      }

      if (type === "addEdge" && operation?.edge && typeof operation.edge.id === "string") {
        return {
          type,
          edge: {
            id: operation.edge.id.slice(0, 120),
            from: typeof operation.edge.from === "string" ? operation.edge.from.slice(0, 120) : "",
            to: typeof operation.edge.to === "string" ? operation.edge.to.slice(0, 120) : "",
            fromSide: typeof operation.edge.fromSide === "string" ? operation.edge.fromSide.slice(0, 12) : "right",
            toSide: typeof operation.edge.toSide === "string" ? operation.edge.toSide.slice(0, 12) : "left",
            label: typeof operation.edge.label === "string" ? operation.edge.label.slice(0, 200) : "",
          },
        };
      }

      if (type === "removeEdge" && typeof operation?.id === "string") {
        return {
          type,
          id: operation.id.slice(0, 120),
        };
      }

      return null;
    })
    .filter(Boolean);
}

async function handleChat(request, response) {
  if (!client) {
    sendJson(response, 503, {
      error: "MINIMAX_API_KEY is not configured on the server. Add it to your environment and restart the app.",
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
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: buildDeveloperPrompt(),
        },
        ...messages,
      ],
      extra_body: {
        reasoning_split: true,
      },
    });

    const reply = extractChatText(completion);
    if (!reply) {
      throw new Error("MiniMax returned an empty response.");
    }

    sendJson(response, 200, {
      reply,
      model: MODEL,
    });
  } catch (error) {
    sendJson(response, 502, {
      error:
        error instanceof Error
          ? `MiniMax request failed: ${error.message}`
          : "MiniMax request failed.",
    });
  }
}

async function handleWorkspaceAssistant(request, response) {
  if (!client) {
    sendJson(response, 503, {
      error: "MINIMAX_API_KEY is not configured on the server. Add it to your environment and restart the app.",
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
    sendJson(response, 400, { error: "At least one workspace assistant message is required." });
    return;
  }

  const workspaceContext = normalizeWorkspaceBody(body);

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: buildWorkspaceAssistantPrompt(workspaceContext),
        },
        ...messages,
      ],
      extra_body: {
        reasoning_split: true,
      },
    });

    const rawReply = extractChatText(completion);
    if (!rawReply) {
      throw new Error("MiniMax returned an empty workspace response.");
    }

    let reply = rawReply;
    let operations = [];

    try {
      const payload = extractJsonObject(rawReply);
      reply = typeof payload.reply === "string" && payload.reply.trim() ? payload.reply.trim() : rawReply;
      operations = normalizeWorkspaceOperations(payload.operations);
    } catch {}

    sendJson(response, 200, {
      reply,
      operations,
      model: MODEL,
    });
  } catch (error) {
    sendJson(response, 502, {
      error:
        error instanceof Error
          ? `MiniMax request failed: ${error.message}`
          : "MiniMax request failed.",
    });
  }
}

async function handleBoardGet(response, boardId) {
  const payload = await boardStore.getBoard(boardId);

  if (!payload) {
    sendJson(response, 404, { error: `Board ${boardId} was not found.` });
    return;
  }

  sendJson(response, 200, payload);
}

async function handleBoardPut(request, response, boardId) {
  let body;
  try {
    body = await parseJsonBody(request);
  } catch {
    sendJson(response, 400, { error: "Request body must be valid JSON." });
    return;
  }

  if (!body || typeof body.board !== "object" || Array.isArray(body.board)) {
    sendJson(response, 400, { error: "Request body must include a board object." });
    return;
  }

  try {
    const payload = await boardStore.saveBoard(boardId, body.board);
    sendJson(response, 200, payload);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "BOARD_NOT_FOUND") {
      sendJson(response, 404, { error: `Board ${boardId} was not found.` });
      return;
    }

    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unable to save board.",
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

  if (request.method === "GET" && url.pathname === "/api/collaboration/config") {
    sendJson(response, 200, {
      mode: collaborationConfig.mode,
      provider: collaborationConfig.provider,
      features: collaborationConfig.features,
      endpoints: collaborationConfig.endpoints,
    });
    return;
  }

  if (url.pathname.startsWith("/api/boards/")) {
    const boardId = decodeURIComponent(url.pathname.slice("/api/boards/".length)).trim();

    if (!boardId) {
      sendJson(response, 400, { error: "Board ID is required." });
      return;
    }

    if (request.method === "GET") {
      await handleBoardGet(response, boardId);
      return;
    }

    if (request.method === "PUT") {
      await handleBoardPut(request, response, boardId);
      return;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/chat") {
    await handleChat(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/workspace-assistant") {
    await handleWorkspaceAssistant(request, response);
    return;
  }

  if (request.method === "GET") {
    await handleStatic(url.pathname, response);
    return;
  }

  sendText(response, 405, "Method Not Allowed");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ZM Studio server running at http://127.0.0.1:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
