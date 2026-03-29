import {
  sanitizeCanvasCamera,
  sanitizeCanvasEdges,
  sanitizeCanvasNodes,
} from "./workspace-board.js";

const DEFAULT_CAMERA = { x: 96, y: 80, z: 1 };
const ROOT_KEY = "board";
const CAMERA_KEY = "camera";
const NODES_KEY = "nodes";
const EDGES_KEY = "edges";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeNullableString(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function sanitizePresenceUser(value) {
  return {
    name: normalizeString(value?.name, "Guest"),
    color: normalizeString(value?.color, "#5c8dff"),
  };
}

function sanitizePresenceCursor(value) {
  if (typeof value?.x !== "number" || typeof value?.y !== "number") {
    return null;
  }

  return {
    x: Math.round(value.x),
    y: Math.round(value.y),
  };
}

function sanitizePresenceSelection(value) {
  const nodeIds = Array.isArray(value?.nodeIds)
    ? [...new Set(value.nodeIds.filter((nodeId) => typeof nodeId === "string" && nodeId.trim()))]
    : [];

  return {
    nodeIds,
  };
}

function sanitizePresenceEditing(value) {
  if (typeof value?.nodeId !== "string" || !value.nodeId.trim()) {
    return null;
  }

  return {
    nodeId: value.nodeId,
    field: normalizeString(value?.field, ""),
  };
}

export function createCollaborationBoardPayload(input = {}, options = {}) {
  const fallback = isRecord(options.fallback) ? options.fallback : {};
  const includeCamera = options.includeCamera !== false;
  const rawCamera =
    input.camera ??
    input.defaultCamera ??
    fallback.camera ??
    fallback.defaultCamera ??
    DEFAULT_CAMERA;

  return {
    key: normalizeString(input.key, normalizeString(fallback.key, "workspace")),
    projectId: normalizeNullableString(input.projectId) ?? normalizeNullableString(fallback.projectId),
    title: normalizeString(input.title, normalizeString(fallback.title, "Canvas")),
    description: normalizeString(input.description, normalizeString(fallback.description, "")),
    camera: includeCamera ? sanitizeCanvasCamera(rawCamera, DEFAULT_CAMERA) : undefined,
    nodes: sanitizeCanvasNodes(input.nodes ?? fallback.nodes ?? []),
    edges: sanitizeCanvasEdges(input.edges ?? input.connections ?? fallback.edges ?? fallback.connections ?? []),
  };
}

export function createCollaborationPayloadFromBoard(board, options = {}) {
  return createCollaborationBoardPayload(board, options);
}

export function applyBoardPayloadToDoc(doc, input, options = {}) {
  const payload = createCollaborationBoardPayload(input, options);
  const includeCamera = options.includeCamera !== false;
  const root = doc.getMap(ROOT_KEY);

  doc.transact(() => {
    root.set("key", payload.key);
    root.set("projectId", payload.projectId);
    root.set("title", payload.title);
    root.set("description", payload.description);

    if (includeCamera) {
      root.set(CAMERA_KEY, cloneValue(payload.camera || DEFAULT_CAMERA));
    }

    root.set(NODES_KEY, cloneValue(payload.nodes));
    root.set(EDGES_KEY, cloneValue(payload.edges));
  }, options.origin);

  return payload;
}

export function readBoardPayloadFromDoc(doc, options = {}) {
  const fallback = isRecord(options.fallback) ? options.fallback : {};
  const root = doc.getMap(ROOT_KEY);

  return createCollaborationBoardPayload(
    {
      key: root.get("key"),
      projectId: root.get("projectId"),
      title: root.get("title"),
      description: root.get("description"),
      camera: root.get(CAMERA_KEY),
      nodes: root.get(NODES_KEY),
      edges: root.get(EDGES_KEY),
    },
    {
      fallback,
      includeCamera: true,
    },
  );
}

export function boardPayloadEquals(left, right, options = {}) {
  const includeCamera = options.includeCamera !== false;

  return JSON.stringify({
    key: left?.key || "",
    projectId: left?.projectId || null,
    title: left?.title || "",
    description: left?.description || "",
    camera: includeCamera ? left?.camera || DEFAULT_CAMERA : null,
    nodes: left?.nodes || [],
    edges: left?.edges || [],
  }) ===
    JSON.stringify({
      key: right?.key || "",
      projectId: right?.projectId || null,
      title: right?.title || "",
      description: right?.description || "",
      camera: includeCamera ? right?.camera || DEFAULT_CAMERA : null,
      nodes: right?.nodes || [],
      edges: right?.edges || [],
    });
}

export function normalizePresenceState(state) {
  return {
    user: sanitizePresenceUser(state?.user),
    cursor: sanitizePresenceCursor(state?.cursor),
    selection: sanitizePresenceSelection(state?.selection),
    editing: sanitizePresenceEditing(state?.editing),
  };
}

export function collectPresenceStates(awareness, localClientId = null) {
  return Array.from(awareness.getStates().entries())
    .filter(([clientId]) => clientId !== localClientId)
    .map(([clientId, value]) => ({
      clientId,
      ...normalizePresenceState(value),
    }));
}
