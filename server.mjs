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
  loadSkillCatalog,
  buildAvailableSkillsXml,
  buildSkillsPublicSummary,
} from "./workspace-assistant-skills.mjs";
import {
  AGENT_TOOL_SCHEMAS,
  executeAgentTool,
  createSkillSession,
  destroySkillSession,
} from "./workspace-assistant-tools.mjs";
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
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://subtp7eu3nc8.tokenclub.top/v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const IMAGE_SIZE = process.env.OPENAI_IMAGE_SIZE || "1024x1024";
const REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "xhigh";
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
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-ef2b3b6329193ad6124e348597c30d465b8dc60e5ae71f314cb8673d076d2bf7",
  baseURL: OPENAI_BASE_URL,
});

const LLM_REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || 90_000);
const LLM_MAX_RETRY_ATTEMPTS = Number(process.env.OPENAI_MAX_RETRY_ATTEMPTS || 3);
const LLM_RETRY_BASE_DELAY_MS = Number(process.env.OPENAI_RETRY_BASE_DELAY_MS || 1000);
const AGENT_LOOP_MAX_ITERATIONS = Number(process.env.OPENAI_AGENT_LOOP_MAX_ITERATIONS || 12);

let cachedSkillCatalog = await loadSkillCatalog({ rootDir: ROOT_DIR });

async function refreshSkillCatalog() {
  cachedSkillCatalog = await loadSkillCatalog({ rootDir: ROOT_DIR });
  return cachedSkillCatalog;
}

async function callOpenAIChatWithRetry(params, { maxAttempts = LLM_MAX_RETRY_ATTEMPTS } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);
    try {
      return await client.chat.completions.create(params, { signal: controller.signal });
    } catch (error) {
      lastError = error;
      const status = error?.status || error?.response?.status;
      const isClientError = typeof status === "number" && status >= 400 && status < 500;
      const isAbort = error?.name === "AbortError" || /aborted|timeout/i.test(String(error?.message || ""));
      if (isClientError && !isAbort) throw error;
      if (attempt >= maxAttempts) throw error;
      const delay = LLM_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `OpenAI request failed (attempt ${attempt}/${maxAttempts}, ${isAbort ? "timeout" : "network/5xx"}): ${
          error?.message || error
        }. Retrying in ${delay}ms.`,
      );
      await wait(delay);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

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

function buildGeneratedImageFilename(prompt) {
  const slug = sanitizePathSegment(String(prompt || "ai-image").slice(0, 60), "ai-image");
  return `ai-${Date.now()}-${Math.floor(Math.random() * 1000)}-${slug}.png`;
}

async function fetchImageBufferFromUrl(url) {
  const fetchImpl = typeof fetch === "function" ? fetch : null;
  if (!fetchImpl) {
    throw new Error("Global fetch is not available to download generated image.");
  }
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Generated image download failed with status ${res.status}.`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const headerMime = normalizeMimeType(res.headers.get("content-type") || "") || "image/png";
  return { buffer: Buffer.from(arrayBuffer), mimeType: headerMime };
}

async function generateAndSaveImageForBoard({ prompt, boardKey, size }) {
  if (!client) {
    throw new Error("AI client is not configured.");
  }
  const trimmedPrompt = String(prompt || "").trim();
  if (!trimmedPrompt) {
    throw new Error("Image generation requires a non-empty prompt.");
  }

  const safeBoardKey = sanitizePathSegment(boardKey, "overview");
  const requestedSize = typeof size === "string" && size.trim() ? size.trim() : IMAGE_SIZE;

  const result = await client.images.generate({
    model: IMAGE_MODEL,
    prompt: trimmedPrompt,
    n: 1,
    size: requestedSize,
  });

  const item = Array.isArray(result?.data) ? result.data[0] : null;
  if (!item) {
    throw new Error("Image API returned no data.");
  }

  let buffer;
  let mimeType = "image/png";
  if (typeof item.b64_json === "string" && item.b64_json) {
    buffer = Buffer.from(item.b64_json, "base64");
  } else if (typeof item.url === "string" && item.url) {
    const downloaded = await fetchImageBufferFromUrl(item.url);
    buffer = downloaded.buffer;
    mimeType = downloaded.mimeType || mimeType;
  } else {
    throw new Error("Image API response did not include image data.");
  }

  const storedName = buildGeneratedImageFilename(trimmedPrompt);
  const boardDir = path.join(uploadStorageDir, safeBoardKey);
  const storedPath = path.join(boardDir, storedName);
  await mkdir(boardDir, { recursive: true });
  await writeFile(storedPath, buffer);

  const urlPath = `/${path.relative(ROOT_DIR, storedPath).split(path.sep).join("/")}`;

  return {
    url: urlPath,
    mimeType,
    fileKind: inferUploadKind(mimeType, storedName),
    storedName,
    size: buffer.length,
    prompt: trimmedPrompt,
    boardKey: safeBoardKey,
    model: IMAGE_MODEL,
  };
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
    content: typeof node.content === "string" ? node.content.slice(0, 9600) : "",
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

const WORKSPACE_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/x-bmp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/apng",
]);
const WORKSPACE_IMAGE_EXTENSIONS = new Map([
  [".png", "image/png"],
  [".apng", "image/apng"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".jpe", "image/jpeg"],
  [".jfif", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".svgz", "image/svg+xml"],
  [".bmp", "image/bmp"],
  [".dib", "image/bmp"],
  [".avif", "image/avif"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
  [".tif", "image/tiff"],
  [".tiff", "image/tiff"],
  [".ico", "image/x-icon"],
  [".cur", "image/x-icon"],
]);
const WORKSPACE_MAX_IMAGE_ATTACHMENTS = Math.max(
  1,
  Number(process.env.WORKSPACE_VISION_MAX_IMAGES || 16),
);
const WORKSPACE_MAX_IMAGE_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.WORKSPACE_VISION_MAX_IMAGE_BYTES || 32 * 1024 * 1024),
);
const WORKSPACE_MAX_TOTAL_IMAGE_BYTES = Math.max(
  WORKSPACE_MAX_IMAGE_BYTES,
  Number(process.env.WORKSPACE_VISION_MAX_TOTAL_IMAGE_BYTES || 96 * 1024 * 1024),
);

function inferImageMimeType(node) {
  const mime = String(node?.mimeType || "").toLowerCase().split(";")[0].trim();
  if (mime && WORKSPACE_IMAGE_MIME_TYPES.has(mime)) {
    return mime;
  }
  const url = String(node?.file || "").split("?")[0].split("#")[0].toLowerCase();
  for (const [extension, extMime] of WORKSPACE_IMAGE_EXTENSIONS) {
    if (url.endsWith(extension)) {
      return extMime;
    }
  }
  return "";
}

function isWorkspaceImageNode(node) {
  if (!node || typeof node !== "object") return false;
  if (node.type !== "image" && node.type !== "file") return false;
  if (node.fileKind && node.fileKind !== "image") return false;
  return Boolean(inferImageMimeType(node));
}

function resolveLocalUploadPath(urlPath) {
  if (typeof urlPath !== "string" || !urlPath) return null;
  const cleaned = urlPath.split("?")[0].split("#")[0];

  // Already a data: or external URL — caller will handle it.
  if (cleaned.startsWith("data:") || /^https?:\/\//i.test(cleaned)) {
    return null;
  }

  // The upload handler stores files under ROOT_DIR and exposes them at "/<rel-path>".
  const trimmed = cleaned.replace(/^\/+/, "");
  const candidate = path.resolve(ROOT_DIR, trimmed);

  // Defensive: ensure the resolved path stays under ROOT_DIR.
  if (!candidate.startsWith(`${ROOT_DIR}${path.sep}`) && candidate !== ROOT_DIR) {
    return null;
  }

  return candidate;
}

async function loadImageAttachmentForNode(node) {
  const mimeType = inferImageMimeType(node);
  if (!mimeType) return null;
  const url = String(node.file || "").trim();
  if (!url) return null;

  if (url.startsWith("data:")) {
    return { dataUrl: url, byteSize: url.length, mimeType };
  }

  if (/^https?:\/\//i.test(url)) {
    // External URL — pass through; vision-capable models can fetch it directly.
    return { dataUrl: url, byteSize: 0, mimeType };
  }

  const localPath = resolveLocalUploadPath(url);
  if (!localPath) return null;

  try {
    const buffer = await readFile(localPath);
    if (buffer.length > WORKSPACE_MAX_IMAGE_BYTES) {
      console.warn(
        `Workspace image ${url} (${buffer.length} bytes) exceeds per-image cap (${WORKSPACE_MAX_IMAGE_BYTES} bytes); skipping inline attachment.`,
      );
      return null;
    }
    return {
      dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
      byteSize: buffer.length,
      mimeType,
    };
  } catch (error) {
    console.warn(
      `Workspace image ${url} could not be read for AI attachment: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return null;
  }
}

async function collectWorkspaceImageAttachments(workspaceContext) {
  const focus = workspaceContext?.focus || {};
  const candidates = [];
  const seen = new Set();

  const addNode = (node) => {
    if (!isWorkspaceImageNode(node)) return;
    const key = `${node.id || ""}::${node.file || ""}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push(node);
  };

  // Priority order: explicit context, selected, connected, then visible/board nodes.
  for (const node of focus.contextNodes || []) addNode(node);
  for (const node of focus.selectedNodes || []) addNode(node);
  for (const node of focus.connectedNodes || []) addNode(node);
  for (const node of focus.visibleNodes || []) addNode(node);
  for (const node of workspaceContext?.board?.nodes || []) addNode(node);

  const attachments = [];
  let totalBytes = 0;
  for (const node of candidates) {
    if (attachments.length >= WORKSPACE_MAX_IMAGE_ATTACHMENTS) break;
    const loaded = await loadImageAttachmentForNode(node);
    if (!loaded) continue;
    if (totalBytes + loaded.byteSize > WORKSPACE_MAX_TOTAL_IMAGE_BYTES) {
      console.warn(
        `Workspace image ${node.file} skipped: total inline budget (${WORKSPACE_MAX_TOTAL_IMAGE_BYTES} bytes) reached.`,
      );
      continue;
    }
    totalBytes += loaded.byteSize;
    attachments.push({
      nodeId: node.id || "",
      title: node.title || node.label || "",
      url: loaded.dataUrl,
      mimeType: loaded.mimeType,
    });
  }

  return attachments;
}

function attachImagesToLastUserMessage(messages, attachments) {
  if (!Array.isArray(messages) || messages.length === 0 || attachments.length === 0) {
    return messages;
  }

  const next = messages.map((message) => ({ ...message }));
  let lastUserIndex = -1;
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index].role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex === -1) return messages;

  const target = next[lastUserIndex];
  const textContent = typeof target.content === "string" ? target.content : "";

  const contentBlocks = [];
  if (textContent.trim()) {
    contentBlocks.push({ type: "text", text: textContent });
  }
  for (const attachment of attachments) {
    contentBlocks.push({
      type: "image_url",
      image_url: { url: attachment.url },
    });
  }

  next[lastUserIndex] = {
    role: "user",
    content: contentBlocks,
  };
  return next;
}

function buildWorkspaceAssistantPrompt(
  workspaceContext,
  memorySection = "Long-term memory:\n- none",
  skillCatalog = { skills: [] },
  imageAttachments = [],
) {
  const hasContext = workspaceContext.focus.contextNodeIds?.length > 0;
  const priorityInstruction = hasContext
    ? "The user has explicitly selected specific nodes as AI context (marked in focus.contextNodes with full data). Prioritize these context nodes above everything else, then use connected nodes and the canvas digest for broader understanding."
    : "No specific nodes are selected as AI context. Use the canvas digest and full node list to understand the board holistically.";
  const imageInstruction =
    Array.isArray(imageAttachments) && imageAttachments.length > 0
      ? `The user's message includes ${imageAttachments.length} image attachment(s) from the canvas (in order: ${imageAttachments
          .map((attachment, index) => `#${index + 1} ${attachment.title || attachment.nodeId || "image"}`)
          .join("; ")}). Examine each image directly when answering and reference it by its node title when relevant.`
      : "No image attachments accompany this turn — describe images only from the textual board context.";

  const availableSkillsXml = buildAvailableSkillsXml(skillCatalog);
  const skillCount = Array.isArray(skillCatalog?.skills) ? skillCatalog.skills.length : 0;
  const skillUsageInstruction =
    skillCount > 0
      ? [
          "Skills are available via progressive disclosure:",
          "- Below is <available_skills> with id + one-line description for each installed skill (Level 1).",
          "- When a user request matches a skill, call the load_skill(skill_id) tool to receive the full SKILL.md instructions and the skill's base path (Level 2).",
          "- After loading a skill, use the bash / read_file / write_file tools to run bundled scripts and read referenced resources (Level 3). Script source code never enters context — only stdout/stderr does.",
          "- When no skill applies, answer directly without calling load_skill. Skills are an option, not a requirement.",
        ].join("\n")
      : "No workspace skills are currently installed. Answer directly without invoking the load_skill tool.";

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
    "",
    skillUsageInstruction,
    availableSkillsXml,
    "",
    "When you are ready to give the FINAL answer to the user (no more tool calls needed), return JSON only with this shape:",
    '{"reply":"short helpful response","operations":[{"type":"addNode","node":{}},{"type":"updateNode","id":"node-id","patch":{}},{"type":"removeNode","id":"node-id"},{"type":"addEdge","edge":{}},{"type":"removeEdge","id":"edge-id"},{"type":"generateImage","prompt":"...","x":0,"y":0,"w":360,"h":280,"title":"optional"}]}',
    "ALWAYS write a non-empty `reply` string addressed to the user, even when you also include canvas operations. The reply should briefly explain what you did or answer the user's question in their language. Never leave `reply` empty — the user reads it as your message in the chat.",
    "Allowed node types: text, link, group, image, project, file.",
    "For addNode include id, type, x, y, w, h and any relevant content fields.",
    "For addEdge include id, from, to, fromSide, toSide, and optional label.",
    "When the user asks you to generate, draw, paint, or create an image (e.g. \"帮我生成一张图片\", \"画一张...\", \"generate an image of...\"), emit a generateImage operation instead of an addNode. Provide a vivid, self-contained English prompt of 1-3 sentences in the prompt field. Pick a reasonable canvas position near the focused area (or 0,0 if unknown) and use w around 360 and h around 280 unless the user requests another aspect. The server will run the image model, save the file, and insert it onto the canvas as an image card automatically — do not invent a file URL yourself.",
    "Never reference node IDs that do not exist when updating or removing.",
    "Prefer small, precise edits over rewriting the whole board.",
    "If the request is only analytical, return operations as an empty array.",
    "Match the user's language when possible.",
    imageInstruction,
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
            content: typeof operation.node.content === "string" ? operation.node.content.slice(0, 9600) : "",
            url: typeof operation.node.url === "string" ? operation.node.url.slice(0, 500) : "",
            file: typeof operation.node.file === "string" ? operation.node.file.slice(0, 500) : "",
            fileKind: typeof operation.node.fileKind === "string" ? operation.node.fileKind.slice(0, 24) : "",
            mimeType: typeof operation.node.mimeType === "string" ? operation.node.mimeType.slice(0, 60) : "",
            tags: Array.isArray(operation.node.tags)
              ? operation.node.tags.map((tag) => String(tag).slice(0, 60)).slice(0, 8)
              : [],
          },
        };
      }

      if (type === "generateImage" && typeof operation?.prompt === "string" && operation.prompt.trim()) {
        return {
          type,
          prompt: operation.prompt.slice(0, 1200),
          x: typeof operation.x === "number" ? Math.round(operation.x) : 0,
          y: typeof operation.y === "number" ? Math.round(operation.y) : 0,
          w: typeof operation.w === "number" ? Math.max(160, Math.round(operation.w)) : 360,
          h: typeof operation.h === "number" ? Math.max(120, Math.round(operation.h)) : 280,
          title: typeof operation.title === "string" ? operation.title.slice(0, 200) : "",
          size: typeof operation.size === "string" ? operation.size.slice(0, 24) : "",
          id: typeof operation.id === "string" ? operation.id.slice(0, 120) : "",
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

async function expandGenerateImageOperations(operations, { boardKey } = {}) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return { operations: [], generated: [] };
  }

  const expanded = [];
  const generated = [];

  for (const operation of operations) {
    if (operation?.type !== "generateImage") {
      expanded.push(operation);
      continue;
    }

    try {
      const result = await generateAndSaveImageForBoard({
        prompt: operation.prompt,
        boardKey,
        size: operation.size,
      });

      const nodeId =
        operation.id && typeof operation.id === "string" && operation.id.trim()
          ? operation.id
          : `image-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      expanded.push({
        type: "addNode",
        node: {
          id: nodeId,
          type: "file",
          x: typeof operation.x === "number" ? operation.x : 0,
          y: typeof operation.y === "number" ? operation.y : 0,
          w: typeof operation.w === "number" ? operation.w : 360,
          h: typeof operation.h === "number" ? operation.h : 280,
          title: operation.title || result.storedName,
          label: operation.title || "",
          content: result.url,
          file: result.url,
          fileKind: result.fileKind,
          mimeType: result.mimeType,
          tags: [],
        },
      });

      generated.push({ id: nodeId, prompt: result.prompt, url: result.url });
    } catch (error) {
      console.warn(
        `Image generation failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      generated.push({
        error: error instanceof Error ? error.message : "Image generation failed.",
        prompt: operation.prompt,
      });
    }
  }

  return { operations: expanded, generated };
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
      error: "OPENAI_API_KEY is not configured on the server. Add it to your environment and restart the app.",
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
          reasoning_effort: REASONING_EFFORT,
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
        throw new Error("OpenAI returned an empty response.");
      }

      writeSseEvent(response, {
        type: "done",
        model: MODEL,
      });
      response.end();
      return;
    }

    const completion = await callOpenAIChatWithRetry({
      model: MODEL,
      messages: chatMessages,
      extra_body: {
        reasoning_split: true,
        reasoning_effort: REASONING_EFFORT,
      },
    });

    const reply = extractChatText(completion);
    if (!reply) {
      throw new Error("OpenAI returned an empty response.");
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
            ? `OpenAI request failed: ${error.message}`
            : "OpenAI request failed.",
      });
      response.end();
      return;
    }

    sendJson(response, 502, {
      error:
        error instanceof Error
          ? `OpenAI request failed: ${error.message}`
          : "OpenAI request failed.",
    });
  }
}

function summarizeToolResult(toolName, result) {
  if (!result || typeof result !== "object") return "";
  if (result.ok === false) return `error: ${result.error || "unknown"}`;
  if (toolName === "load_skill") return `loaded ${result.skill_id || "skill"}`;
  if (toolName === "bash") {
    if (result.timed_out) return "timed out";
    return `exit ${result.exit_code ?? "?"}`;
  }
  if (toolName === "read_file") {
    const name = typeof result.path === "string" ? result.path.split("/").pop() : "file";
    return `read ${name}`;
  }
  if (toolName === "write_file") return `wrote ${result.bytes_written ?? 0} bytes`;
  return "";
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
      error: "OPENAI_API_KEY is not configured on the server. Add it to your environment and restart the app.",
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
  const memoryQuery = buildMemoryLookupQuery({ workspaceContext, messages });
  const relevantMemories = await memoryStore.findRelevantMemories({
    scopes: memoryScopes,
    query: memoryQuery,
    limit: 5,
  });
  const memorySection = formatMemoriesForPrompt(relevantMemories);
  const imageAttachments = await collectWorkspaceImageAttachments(workspaceContext);
  const augmentedMessages = imageAttachments.length > 0
    ? attachImagesToLastUserMessage(messages, imageAttachments)
    : messages;

  const skillCatalog = cachedSkillCatalog;
  const session = await createSkillSession({ rootDir: ROOT_DIR });

  let sseOpen = false;
  const emitSse = (payload) => {
    if (!streamRequested) return;
    if (!sseOpen) {
      openSseStream(response);
      sseOpen = true;
    }
    writeSseEvent(response, payload);
  };

  try {
    const systemPrompt = buildWorkspaceAssistantPrompt(
      workspaceContext,
      memorySection,
      skillCatalog,
      imageAttachments,
    );
    const conversation = [
      { role: "system", content: systemPrompt },
      ...augmentedMessages,
    ];

    let finalAssistantText = "";
    let iterationsRun = 0;
    const toolCallTrace = [];

    for (let iteration = 0; iteration < AGENT_LOOP_MAX_ITERATIONS; iteration += 1) {
      iterationsRun = iteration + 1;

      const completion = await callOpenAIChatWithRetry({
        model: MODEL,
        messages: conversation,
        tools: AGENT_TOOL_SCHEMAS,
        tool_choice: "auto",
        extra_body: {
          reasoning_split: true,
          reasoning_effort: REASONING_EFFORT,
        },
      });

      const choice = completion?.choices?.[0];
      const message = choice?.message;
      if (!message) {
        throw new Error("OpenAI returned no message.");
      }

      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

      if (toolCalls.length === 0) {
        finalAssistantText = typeof message.content === "string" ? message.content : "";
        break;
      }

      conversation.push({
        role: "assistant",
        content: typeof message.content === "string" ? message.content : "",
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name || "";
        emitSse({
          type: "tool_call_start",
          iteration: iterationsRun,
          tool_call_id: toolCall.id,
          name: toolName,
          arguments: toolCall.function?.arguments || "",
        });

        const result = await executeAgentTool({
          toolCall,
          catalog: skillCatalog,
          sessionDir: session.sessionDir,
        });

        const summary = summarizeToolResult(toolName, result);
        toolCallTrace.push({
          tool_call_id: toolCall.id,
          name: toolName,
          ok: result?.ok !== false,
          summary,
        });

        emitSse({
          type: "tool_call_end",
          iteration: iterationsRun,
          tool_call_id: toolCall.id,
          name: toolName,
          ok: result?.ok !== false,
          summary,
        });

        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    if (!finalAssistantText) {
      throw new Error(`Agent loop exceeded ${AGENT_LOOP_MAX_ITERATIONS} iterations without a final reply.`);
    }

    let reply = finalAssistantText;
    let operations = [];

    try {
      const payload = extractJsonObject(finalAssistantText);
      reply = typeof payload.reply === "string" ? payload.reply.trim() : "";
      operations = normalizeWorkspaceOperations(payload.operations);
    } catch {}

    if (!reply) {
      reply =
        operations.length > 0
          ? `已根据你的请求更新画布（${operations.length} 项变更）。`
          : "好的。";
    }

    const expansion = await expandGenerateImageOperations(operations, {
      boardKey: workspaceContext?.board?.key,
    });
    operations = expansion.operations;
    if (expansion.generated.length > 0) {
      const okCount = expansion.generated.filter((entry) => !entry.error).length;
      const failCount = expansion.generated.length - okCount;
      const summaryParts = [];
      if (okCount > 0) summaryParts.push(`Generated ${okCount} image${okCount > 1 ? "s" : ""}.`);
      if (failCount > 0) {
        const firstError = expansion.generated.find((entry) => entry.error)?.error;
        summaryParts.push(
          `${failCount} image generation${failCount > 1 ? "s" : ""} failed${firstError ? `: ${firstError}` : "."}`,
        );
      }
      reply = reply ? `${reply}\n\n${summaryParts.join(" ")}` : summaryParts.join(" ");
    }

    const extractedMemories = extractDurableMemories({ workspaceContext, messages });

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
      iterations: iterationsRun,
      tool_calls: toolCallTrace,
    };

    if (streamRequested) {
      if (!sseOpen) {
        openSseStream(response);
        sseOpen = true;
      }
      await writeChunkedAssistantText(response, reply, 18);
      writeSseEvent(response, {
        type: "done",
        model: MODEL,
        operations,
        iterations: iterationsRun,
        tool_calls: toolCallTrace,
      });
      response.end();
      return;
    }

    sendJson(response, 200, responsePayload);
  } catch (error) {
    if (streamRequested && (sseOpen || response.headersSent)) {
      if (!sseOpen) {
        openSseStream(response);
        sseOpen = true;
      }
      writeSseEvent(response, {
        type: "error",
        error: error instanceof Error ? `OpenAI request failed: ${error.message}` : "OpenAI request failed.",
      });
      response.end();
      return;
    }

    sendJson(response, 502, {
      error: error instanceof Error ? `OpenAI request failed: ${error.message}` : "OpenAI request failed.",
    });
  } finally {
    await destroySkillSession({ sessionDir: session.sessionDir });
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
    sendJson(response, 200, {
      ...studioSnapshot,
      assistant: {
        ...studioSnapshot.assistant,
        skills: buildSkillsPublicSummary(cachedSkillCatalog),
      },
    });
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
