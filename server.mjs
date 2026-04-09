import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";
import { createBoardStore } from "./board-store.mjs";
import { getCollaborationConfig } from "./collaboration-config.mjs";
import { createMemoryStore } from "./memory-store.mjs";
import { createRealtimeCollaborationServer } from "./realtime-collaboration-server.mjs";
import { ensureWorkspaceAppBuild } from "./scripts/build-workspace-app.mjs";
import { createStudioRepository } from "./studio-repository.mjs";
import {
  buildMemoryLookupQuery,
  deriveMemoryScopes,
  extractDurableMemories,
  formatMemoriesForPrompt,
} from "./workspace-memory.mjs";

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
await ensureWorkspaceAppBuild();

function parseJsonEnv(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const PORT = Number(process.env.PORT || 4173);
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || "https://shell.wyzai.top/v1";
const MODEL = process.env.MINIMAX_MODEL || "gpt-5.4";
const MAX_UPLOAD_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 25 * 1024 * 1024);
const CHAT_STREAM_TEST_MODE = process.env.CHAT_STREAM_TEST_MODE === "1";
const CHAT_STREAM_TEST_TEXT =
  process.env.CHAT_STREAM_TEST_TEXT || "This is a local streaming test response for the projects assistant.";
const CHAT_STREAM_TEST_DELAY_MS = Number(process.env.CHAT_STREAM_TEST_DELAY_MS || 70);
const WORKSPACE_ASSISTANT_STREAM_TEST_MODE = process.env.WORKSPACE_ASSISTANT_STREAM_TEST_MODE === "1";
const WORKSPACE_ASSISTANT_STREAM_TEST_TEXT =
  process.env.WORKSPACE_ASSISTANT_STREAM_TEST_TEXT || "This is a local streaming test response for the workspace assistant.";
const WORKSPACE_ASSISTANT_STREAM_TEST_DELAY_MS = Number(process.env.WORKSPACE_ASSISTANT_STREAM_TEST_DELAY_MS || 70);
const WORKSPACE_ASSISTANT_STREAM_TEST_OPERATIONS = normalizeWorkspaceOperations(
  parseJsonEnv(process.env.WORKSPACE_ASSISTANT_STREAM_TEST_OPERATIONS_JSON, []),
);
const collaborationConfig = getCollaborationConfig(process.env, ROOT_DIR);
const uploadStorageDir = resolveUploadStorageDir(process.env.UPLOAD_STORE_DIR || path.join(ROOT_DIR, ".data", "uploads"));
const studioRepository = createStudioRepository({
  dbPath: process.env.STUDIO_DB_PATH,
});
await studioRepository.ensureInitialized();
const boardStore = createBoardStore({
  provider: studioRepository.provider || collaborationConfig.provider,
  storageDir: collaborationConfig.storageDir,
  repository: studioRepository,
});
const memoryStore = createMemoryStore({
  storageDir: process.env.MEMORY_STORE_DIR || path.join(ROOT_DIR, ".data", "memory"),
});
const collaborationServer = createRealtimeCollaborationServer({
  boardStore,
  config: collaborationConfig,
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
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function resolveUploadStorageDir(storageDir) {
  const resolvedStorageDir = path.resolve(storageDir);
  const resolvedRoot = path.resolve(ROOT_DIR);

  if (!resolvedStorageDir.startsWith(resolvedRoot)) {
    throw new Error("UPLOAD_STORE_DIR must stay inside the workspace root.");
  }

  return resolvedStorageDir;
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

async function parseRawBody(request, maxBytes = MAX_UPLOAD_BYTES) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxBytes) {
      const error = new Error(`Uploads must be ${maxBytes} bytes or smaller.`);
      error.code = "UPLOAD_TOO_LARGE";
      throw error;
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function normalizeMimeType(value) {
  if (typeof value !== "string") return "";
  return value.split(";")[0].trim().toLowerCase();
}

function sanitizePathSegment(value, fallback = "board") {
  const safe = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safe || fallback;
}

function sanitizeUploadFilename(value) {
  // The client URL-encodes the filename to avoid non-ISO-8859-1 characters in HTTP headers
  // (e.g. Chinese characters like 截屏 in macOS screenshot filenames).
  let decoded = String(value || "upload.bin").trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {}
  const basename = path.basename(decoded) || "upload.bin";
  const extension = path.extname(basename).toLowerCase();
  const stem = basename.slice(0, basename.length - extension.length) || "upload";
  const safeStem = sanitizePathSegment(stem, "upload");
  const safeExtension = extension.replace(/[^a-z0-9.]/g, "");
  return `${safeStem}${safeExtension}`;
}

function inferMimeTypeFromFilename(filename, fallback = "application/octet-stream") {
  const extension = path.extname(filename).toLowerCase();
  const mapped = MIME_TYPES[extension];
  return mapped ? normalizeMimeType(mapped) : fallback;
}

function inferUploadKind(mimeType, filename = "") {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const extension = path.extname(filename).toLowerCase();

  if (normalizedMimeType.startsWith("image/")) {
    return "image";
  }

  if (normalizedMimeType === "application/pdf" || extension === ".pdf") {
    return "pdf";
  }

  return "other";
}

function normalizeChatAgent(value) {
  return value === "projects" || value === "assets" ? value : "portfolio";
}

async function buildChatPrompt(agent = "portfolio") {
  const studioSnapshot = await studioRepository.getStudioSnapshot();
  const projects = studioSnapshot.projects.map(({ canvas, ...project }) => project);
  const portfolioSnapshot = {
    studio: studioSnapshot.studio,
    assistant: studioSnapshot.assistant,
    projects,
    assets: studioSnapshot.assets,
  };

  if (agent === "projects") {
    return [
      "You are the AI project manager for ZM Studio.",
      "Answer only from the project library provided below.",
      "Focus on project summaries, prioritization, case-study picks, sequencing, and filtering suggestions.",
      "Do not invent projects, locations, budgets, team members, or statuses.",
      "If a requested detail is missing from the data, say that the current project library does not include it.",
      "Prefer concise, direct answers with light formatting.",
      "Match the user's language when possible.",
      "",
      "Project library:",
      JSON.stringify(
        {
          studio: studioSnapshot.studio,
          projects,
        },
        null,
        2,
      ),
    ].join("\n");
  }

  if (agent === "assets") {
    return [
      "You are the asset librarian for ZM Studio.",
      "Answer only from the asset library and linked project data provided below.",
      "Focus on finding relevant source files, related projects, deliverables, locations, and representative case-study material.",
      "Do not invent assets, file links, project metadata, or deliverables.",
      "If a requested detail is missing from the data, say that the current asset library does not include it.",
      "Prefer concise, direct answers with light formatting.",
      "Match the user's language when possible.",
      "",
      "Asset library:",
      JSON.stringify(portfolioSnapshot, null, 2),
    ].join("\n");
  }

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

function extractChatDeltaText(chunk) {
  const content = chunk?.choices?.[0]?.delta?.content;

  if (typeof content === "string" && content) {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item?.type === "text" && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("");
  }

  return "";
}

function openSseStream(response) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  response.flushHeaders?.();
}

function writeSseEvent(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function writeChunkedAssistantText(response, text, delayMs = 0) {
  const chunkSize = Math.max(6, Math.ceil(text.length / 5));

  for (let index = 0; index < text.length; index += chunkSize) {
    const delta = text.slice(index, index + chunkSize);
    writeSseEvent(response, {
      type: "chunk",
      delta,
    });
    if (delayMs > 0) {
      await wait(delayMs);
    }
  }
}

async function streamStubChatResponse(response) {
  openSseStream(response);
  await writeChunkedAssistantText(response, CHAT_STREAM_TEST_TEXT, CHAT_STREAM_TEST_DELAY_MS);
  writeSseEvent(response, {
    type: "done",
    model: "stream-test-stub",
  });
  response.end();
}

async function streamStubWorkspaceAssistantResponse(response) {
  openSseStream(response);
  await writeChunkedAssistantText(response, WORKSPACE_ASSISTANT_STREAM_TEST_TEXT, WORKSPACE_ASSISTANT_STREAM_TEST_DELAY_MS);
  writeSseEvent(response, {
    type: "done",
    model: "workspace-stream-test-stub",
    operations: WORKSPACE_ASSISTANT_STREAM_TEST_OPERATIONS,
  });
  response.end();
}

async function streamWorkspaceAssistantPayload(response, payload) {
  openSseStream(response);
  await writeChunkedAssistantText(response, payload.reply, 18);
  writeSseEvent(response, {
    type: "done",
    model: payload.model || MODEL,
    operations: payload.operations || [],
  });
  response.end();
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
    file: typeof node.file === "string" ? node.file.slice(0, 500) : "",
    fileKind: typeof node.fileKind === "string" ? node.fileKind.slice(0, 24) : "",
    mimeType: typeof node.mimeType === "string" ? node.mimeType.slice(0, 60) : "",
  };
}

/**
 * Normalize a compact node (only id, type, position, label).
 * Used for non-context nodes to reduce payload size.
 */
function normalizeWorkspaceNodeAny(node) {
  if (!node || typeof node !== "object") return null;

  // If it has content/title fields, it's a full node
  if (node.content || node.title || node.w || node.h) {
    return normalizeWorkspaceNode(node);
  }

  // Compact node: minimal fields only
  return {
    id: typeof node.id === "string" ? node.id.slice(0, 120) : "",
    type: typeof node.type === "string" ? node.type.slice(0, 24) : "text",
    x: typeof node.x === "number" ? Math.round(node.x) : 0,
    y: typeof node.y === "number" ? Math.round(node.y) : 0,
    label: typeof node.label === "string" ? node.label.slice(0, 120) : "",
  };
}

function normalizeWorkspaceBody(body) {
  const board = body && typeof body.board === "object" ? body.board : {};
  const focus = body && typeof body.focus === "object" ? body.focus : {};

  return {
    board: {
      key: typeof board.key === "string" ? board.key.slice(0, 80) : "workspace",
      projectId: typeof board.projectId === "string" ? board.projectId.slice(0, 80) : "",
      title: typeof board.title === "string" ? board.title.slice(0, 120) : "Workspace",
      description: typeof board.description === "string" ? board.description.slice(0, 800) : "",
      nodeCount: typeof board.nodeCount === "number" ? board.nodeCount : Array.isArray(board.nodes) ? board.nodes.length : 0,
      edgeCount: typeof board.edgeCount === "number" ? board.edgeCount : Array.isArray(board.edges) ? board.edges.length : 0,
      digest: typeof board.digest === "string" ? board.digest.slice(0, 4000) : "",
      nodes: Array.isArray(board.nodes) ? board.nodes.map(normalizeWorkspaceNodeAny).filter(Boolean) : [],
      edges: Array.isArray(board.edges)
        ? board.edges.map((edge) => ({
            id: typeof edge?.id === "string" ? edge.id.slice(0, 120) : "",
            from: typeof edge?.from === "string" ? edge.from.slice(0, 120) : "",
            to: typeof edge?.to === "string" ? edge.to.slice(0, 120) : "",
            label: typeof edge?.label === "string" ? edge.label.slice(0, 200) : "",
          }))
        : [],
    },
    focus: {
      contextNodeIds: Array.isArray(focus.contextNodeIds)
        ? focus.contextNodeIds.filter((id) => typeof id === "string").slice(0, 20)
        : [],
      contextNodes: Array.isArray(focus.contextNodes) ? focus.contextNodes.slice(0, 20).map(normalizeWorkspaceNode).filter(Boolean) : [],
      selectedNodes: Array.isArray(focus.selectedNodes) ? focus.selectedNodes.slice(0, 10).map(normalizeWorkspaceNode).filter(Boolean) : [],
      connectedNodes: Array.isArray(focus.connectedNodes)
        ? focus.connectedNodes.slice(0, 12).map(normalizeWorkspaceNode).filter(Boolean)
        : [],
      visibleNodes: Array.isArray(focus.visibleNodes)
        ? focus.visibleNodes.slice(0, 12).map(normalizeWorkspaceNodeAny).filter(Boolean)
        : [],
    },
  };
}

function buildWorkspaceAssistantPrompt(workspaceContext, memorySection = "Long-term memory:\n- none") {
  const hasContext = workspaceContext.focus.contextNodeIds?.length > 0;
  const priorityInstruction = hasContext
    ? "The user has explicitly selected specific nodes as AI context (marked in focus.contextNodes with full data). Prioritize these context nodes above everything else, then use connected nodes and the canvas digest for broader understanding."
    : "No specific nodes are selected as AI context. Use the canvas digest and full node list to understand the board holistically.";

  return [
    "You are the workspace canvas copilot for ZM Studio.",
    "You help the user think on a spatial canvas and you may directly modify the active board.",
    priorityInstruction,
    "IMPORTANT: The board uses TIERED data to save bandwidth:",
    "- board.digest: A human-readable summary of ALL nodes on the canvas (always complete)",
    "- board.nodes: Mixed array — context nodes have full data (content, tags, file, etc.), other nodes have compact data (id, type, position, label only)",
    "- focus.contextNodes: The user-selected nodes with FULL data — these are your primary focus",
    "- focus.connectedNodes: Nodes connected by edges to context nodes (full data)",
    "Use the digest to understand what the canvas contains overall. Use contextNodes for detailed analysis.",
    "Use long-term memory only as durable guidance. Prefer current user instructions if they conflict.",
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
    memorySection,
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
  let body;
  try {
    body = await parseJsonBody(request);
  } catch {
    sendJson(response, 400, { error: "Request body must be valid JSON." });
    return;
  }

  const messages = normalizeMessages(body.messages);
  const agent = normalizeChatAgent(body?.agent);
  const streamRequested = body?.stream === true;
  if (messages.length === 0) {
    sendJson(response, 400, { error: "At least one chat message is required." });
    return;
  }

  if (streamRequested && CHAT_STREAM_TEST_MODE) {
    await streamStubChatResponse(response);
    return;
  }

  if (!client) {
    sendJson(response, 503, {
      error: "MINIMAX_API_KEY is not configured on the server. Add it to your environment and restart the app.",
    });
    return;
  }

  try {
    const chatMessages = [
      {
        role: "system",
        content: await buildChatPrompt(agent),
      },
      ...messages,
    ];

    if (streamRequested) {
      const completion = await client.chat.completions.create({
        model: MODEL,
        stream: true,
        messages: chatMessages,
        extra_body: {
          reasoning_split: true,
        },
      });

      let wroteChunk = false;

      for await (const chunk of completion) {
        const delta = extractChatDeltaText(chunk);
        if (!delta) continue;

        if (!response.headersSent) {
          openSseStream(response);
        }

        writeSseEvent(response, {
          type: "chunk",
          delta,
        });
        wroteChunk = true;
      }

      if (!wroteChunk) {
        throw new Error("MiniMax returned an empty response.");
      }

      writeSseEvent(response, {
        type: "done",
        model: MODEL,
      });
      response.end();
      return;
    }

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: chatMessages,
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
    if (streamRequested && response.headersSent) {
      writeSseEvent(response, {
        type: "error",
        error:
          error instanceof Error
            ? `MiniMax request failed: ${error.message}`
            : "MiniMax request failed.",
      });
      response.end();
      return;
    }

    sendJson(response, 502, {
      error:
        error instanceof Error
          ? `MiniMax request failed: ${error.message}`
          : "MiniMax request failed.",
    });
  }
}

async function handleWorkspaceAssistant(request, response) {
  let body;
  try {
    body = await parseJsonBody(request);
  } catch {
    sendJson(response, 400, { error: "Request body must be valid JSON." });
    return;
  }

  const streamRequested = body?.stream === true;
  if (streamRequested && WORKSPACE_ASSISTANT_STREAM_TEST_MODE) {
    await streamStubWorkspaceAssistantResponse(response);
    return;
  }

  if (!client) {
    sendJson(response, 503, {
      error: "MINIMAX_API_KEY is not configured on the server. Add it to your environment and restart the app.",
    });
    return;
  }

  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    sendJson(response, 400, { error: "At least one workspace assistant message is required." });
    return;
  }

  const workspaceContext = normalizeWorkspaceBody(body);
  const memoryScopes = deriveMemoryScopes(workspaceContext);
  const memoryQuery = buildMemoryLookupQuery({
    workspaceContext,
    messages,
  });
  const relevantMemories = await memoryStore.findRelevantMemories({
    scopes: memoryScopes,
    query: memoryQuery,
    limit: 5,
  });
  const memorySection = formatMemoriesForPrompt(relevantMemories);

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: buildWorkspaceAssistantPrompt(workspaceContext, memorySection),
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

    const extractedMemories = extractDurableMemories({
      workspaceContext,
      messages,
    });

    try {
      if (relevantMemories.length > 0) {
        await memoryStore.touchMemories(relevantMemories.map((item) => item.id));
      }

      if (extractedMemories.length > 0) {
        await memoryStore.upsertMemories(extractedMemories);
      }
    } catch (error) {
      console.warn(error instanceof Error ? error.message : "Unable to persist workspace memory.");
    }

    const responsePayload = {
      reply,
      operations,
      model: MODEL,
    };

    if (streamRequested) {
      await streamWorkspaceAssistantPayload(response, responsePayload);
      return;
    }

    sendJson(response, 200, responsePayload);
  } catch (error) {
    if (streamRequested && response.headersSent) {
      writeSseEvent(response, {
        type: "error",
        error:
          error instanceof Error
            ? `MiniMax request failed: ${error.message}`
            : "MiniMax request failed.",
      });
      response.end();
      return;
    }

    sendJson(response, 502, {
      error:
        error instanceof Error
          ? `MiniMax request failed: ${error.message}`
          : "MiniMax request failed.",
    });
  }
}

async function handleBoardGet(response, boardId) {
  const payload = await collaborationServer.getBoard(boardId);

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
    const payload = await collaborationServer.saveBoard(boardId, body.board);
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

async function handleUploadPost(request, response) {
  let body;

  try {
    body = await parseRawBody(request);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "UPLOAD_TOO_LARGE") {
      sendJson(response, 413, { error: error.message });
      return;
    }

    sendJson(response, 400, {
      error: error instanceof Error ? error.message : "Unable to read upload body.",
    });
    return;
  }

  if (!body || body.length === 0) {
    sendJson(response, 400, { error: "Upload body is required." });
    return;
  }

  const boardKey = sanitizePathSegment(request.headers["x-board-key"], "overview");
  const originalName = sanitizeUploadFilename(request.headers["x-file-name"]);
  const mimeType = normalizeMimeType(request.headers["content-type"]) || inferMimeTypeFromFilename(originalName);
  const boardDir = path.join(uploadStorageDir, boardKey);
  const storedName = `${Date.now()}-${Math.floor(Math.random() * 1000)}-${originalName}`;
  const storedPath = path.join(boardDir, storedName);

  try {
    await mkdir(boardDir, { recursive: true });
    await writeFile(storedPath, body);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unable to persist upload.",
    });
    return;
  }

  const urlPath = `/${path.relative(ROOT_DIR, storedPath).split(path.sep).join("/")}`;

  sendJson(response, 201, {
    upload: {
      boardKey,
      originalName,
      storedName,
      url: urlPath,
      mimeType,
      fileKind: inferUploadKind(mimeType, originalName),
      size: body.length,
    },
  });
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
    const studioSnapshot = await studioRepository.getStudioSnapshot();
    sendJson(response, 200, studioSnapshot);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/collaboration/config") {
    sendJson(response, 200, {
      mode: collaborationConfig.mode,
      provider: boardStore.provider || studioRepository.provider || collaborationConfig.provider,
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

  if (request.method === "POST" && url.pathname === "/api/uploads") {
    await handleUploadPost(request, response);
    return;
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

server.on("upgrade", (request, socket, head) => {
  if (collaborationServer.handleUpgrade(request, socket, head)) {
    return;
  }

  socket.destroy();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ZM Studio server running at http://127.0.0.1:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    collaborationServer.close();
    server.close(() => process.exit(0));
  });
}
