function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeNodeId(node, index) {
  if (typeof node?.id === "string" && node.id.trim()) {
    return node.id;
  }

  return `node-${index + 1}`;
}

function normalizeNodeType(type) {
  const normalized = String(type || "text").toLowerCase();

  if (["text", "project", "image", "link", "group", "file"].includes(normalized)) {
    return normalized;
  }

  return "text";
}

function normalizeMimeType(value) {
  if (typeof value !== "string") return "";
  return value.split(";")[0].trim().toLowerCase();
}

function inferMimeTypeFromFile(file) {
  const extension = String(file || "")
    .trim()
    .split("?")[0]
    .toLowerCase()
    .match(/\.[a-z0-9]+$/)?.[0];

  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".pdf") return "application/pdf";
  return "";
}

function inferFileKind(mimeType, file = "") {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const lowerFile = String(file || "").toLowerCase();

  if (normalizedMimeType === "image" || normalizedMimeType === "pdf" || normalizedMimeType === "other") {
    return normalizedMimeType;
  }

  if (normalizedMimeType.startsWith("image/")) return "image";
  if (normalizedMimeType === "application/pdf" || lowerFile.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(lowerFile)) return "image";
  return "other";
}

function normalizeFileTitle(title, file) {
  if (typeof title === "string" && title.trim()) {
    return title;
  }

  const candidate = String(file || "")
    .split("/")
    .pop()
    ?.split("?")[0];

  return candidate || "Attachment";
}

function normalizeWidth(node) {
  return Math.max(120, Math.round(asNumber(node?.w, asNumber(node?.width, 320))));
}

function normalizeHeight(node) {
  if (node?.h === "auto") return "auto";
  if (node?.height === "auto") return "auto";

  const value = node?.h ?? node?.height;
  if (value === undefined || value === null) return "auto";

  return Math.max(96, Math.round(asNumber(value, 180)));
}

export function resolveNodeHeight(node) {
  if (typeof node?.h === "number") return node.h;
  if (typeof node?.autoHeight === "number" && Number.isFinite(node.autoHeight)) {
    return Math.max(170, Math.round(node.autoHeight));
  }
  if (node?.type === "file") {
    if (node?.fileKind === "pdf") return 420;
    if (node?.fileKind === "image") return 280;
    return 188;
  }
  if (node?.type === "image") return 240;
  if (node?.type === "project") return 250;
  if (node?.type === "group") return 280;
  if (node?.type === "link") return 156;

  const content = String(node?.content || node?.text || "");
  const lineCount = content.split("\n").length;
  return Math.max(170, 100 + lineCount * 22);
}

export function getNodeFrame(node) {
  return {
    x: asNumber(node?.x, 0),
    y: asNumber(node?.y, 0),
    width: normalizeWidth(node),
    height: resolveNodeHeight(node),
  };
}

export function sanitizeCanvasCamera(value, fallback = { x: 96, y: 80, z: 1 }) {
  return {
    x: asNumber(value?.x, fallback.x),
    y: asNumber(value?.y, fallback.y),
    z: clamp(asNumber(value?.z, fallback.z), 0.35, 3),
  };
}

export function sanitizeCanvasNodes(nodes) {
  if (!Array.isArray(nodes)) return [];

  return clone(nodes).map((rawNode, index) => {
    const type = normalizeNodeType(rawNode?.type);
    const node = {
      ...rawNode,
      id: normalizeNodeId(rawNode, index),
      type,
      x: Math.round(asNumber(rawNode?.x, 0)),
      y: Math.round(asNumber(rawNode?.y, 0)),
      w: normalizeWidth(rawNode),
      h: normalizeHeight(rawNode),
      autoHeight:
        typeof rawNode?.autoHeight === "number" && Number.isFinite(rawNode.autoHeight)
          ? Math.max(170, Math.round(rawNode.autoHeight))
          : undefined,
      color: typeof rawNode?.color === "string" ? rawNode.color : undefined,
    };

    if (type === "text") {
      node.content = String(rawNode?.content ?? rawNode?.text ?? "");
    }

    if (type === "project") {
      node.title = String(rawNode?.title ?? "");
      node.desc = String(rawNode?.desc ?? rawNode?.content ?? "");
      node.tags = Array.isArray(rawNode?.tags) ? rawNode.tags.map(String) : [];
    }

    if (type === "image") {
      node.content = String(rawNode?.content ?? rawNode?.file ?? rawNode?.url ?? "");
    }

    if (type === "file") {
      node.file = String(rawNode?.file ?? rawNode?.content ?? rawNode?.url ?? "");
      node.content = node.file;
      node.title = normalizeFileTitle(rawNode?.title ?? rawNode?.label ?? rawNode?.name ?? "", node.file);
      node.mimeType = normalizeMimeType(rawNode?.mimeType) || inferMimeTypeFromFile(node.file);
      node.fileKind = inferFileKind(rawNode?.fileKind ?? node.mimeType, node.file);
      node.size =
        typeof rawNode?.size === "number" && Number.isFinite(rawNode.size) && rawNode.size > 0
          ? Math.round(rawNode.size)
          : undefined;
    }

    if (type === "link") {
      node.title = String(rawNode?.title ?? rawNode?.label ?? "");
      node.url = String(rawNode?.url ?? rawNode?.content ?? "");
      node.content = node.url;
    }

    if (type === "group") {
      node.label = String(rawNode?.label ?? rawNode?.title ?? "");
      node.background = typeof rawNode?.background === "string" ? rawNode.background : "";
      node.backgroundStyle = typeof rawNode?.backgroundStyle === "string" ? rawNode.backgroundStyle : "";
    }

    return node;
  });
}

export function sanitizeCanvasEdges(edges) {
  if (!Array.isArray(edges)) return [];

  return clone(edges)
    .map((edge, index) => {
      const from = typeof edge?.from === "string" ? edge.from : edge?.fromNode;
      const to = typeof edge?.to === "string" ? edge.to : edge?.toNode;

      if (!from || !to) {
        return null;
      }

      return {
        id: typeof edge?.id === "string" && edge.id.trim() ? edge.id : `edge-${index + 1}`,
        from,
        to,
        fromSide: typeof edge?.fromSide === "string" ? edge.fromSide : "right",
        toSide: typeof edge?.toSide === "string" ? edge.toSide : "left",
        fromEnd: typeof edge?.fromEnd === "string" ? edge.fromEnd : "none",
        toEnd: typeof edge?.toEnd === "string" ? edge.toEnd : "arrow",
        color: typeof edge?.color === "string" ? edge.color : undefined,
        label: typeof edge?.label === "string" ? edge.label : "",
      };
    })
    .filter(Boolean);
}

export function createBoardSnapshot(board) {
  return {
    camera: sanitizeCanvasCamera(board?.camera, { x: 96, y: 80, z: 1 }),
    nodes: sanitizeCanvasNodes(board?.nodes),
    edges: sanitizeCanvasEdges(board?.edges),
  };
}

export function applyBoardSnapshot(board, snapshot) {
  if (!board || !snapshot) return;

  board.camera = sanitizeCanvasCamera(snapshot.camera, board.defaultCamera || { x: 96, y: 80, z: 1 });
  board.nodes = sanitizeCanvasNodes(snapshot.nodes);
  board.edges = sanitizeCanvasEdges(snapshot.edges);
}

export function pushBoardHistory(board, snapshot = createBoardSnapshot(board)) {
  if (!board) return;

  board.history = Array.isArray(board.history) ? board.history : [];
  board.future = [];
  board.history.push(clone(snapshot));

  if (board.history.length > 80) {
    board.history.shift();
  }
}

export function undoBoard(board) {
  if (!board || !Array.isArray(board.history) || board.history.length === 0) return false;

  board.future = Array.isArray(board.future) ? board.future : [];
  board.future.push(createBoardSnapshot(board));
  const snapshot = board.history.pop();
  applyBoardSnapshot(board, snapshot);
  return true;
}

export function redoBoard(board) {
  if (!board || !Array.isArray(board.future) || board.future.length === 0) return false;

  board.history = Array.isArray(board.history) ? board.history : [];
  board.history.push(createBoardSnapshot(board));
  const snapshot = board.future.pop();
  applyBoardSnapshot(board, snapshot);
  return true;
}

export function createBoardState({
  boardKey,
  source = {},
  persisted = null,
  projectId = null,
  title = "Canvas",
  description = "",
  fallbackCamera = { x: 96, y: 80, z: 1 },
}) {
  const baseCamera = sanitizeCanvasCamera(source?.camera, fallbackCamera);
  const persistedEdges = persisted?.edges ?? persisted?.connections ?? null;
  const sourceEdges = source?.edges ?? source?.connections ?? [];

  return {
    key: boardKey,
    projectId,
    title: source?.title || title,
    description: source?.description || description,
    defaultCamera: clone(baseCamera),
    camera: sanitizeCanvasCamera(persisted?.camera, baseCamera),
    nodes: sanitizeCanvasNodes(persisted?.nodes ?? source?.nodes ?? []),
    edges: sanitizeCanvasEdges(persistedEdges ?? sourceEdges),
    history: [],
    future: [],
  };
}

function isLikelyLocalFile(value) {
  return typeof value === "string" && value.length > 0 && !/^https?:\/\//i.test(value);
}

function exportNode(node) {
  const base = {
    id: node.id,
    x: Math.round(node.x),
    y: Math.round(node.y),
    width: Math.round(node.w),
    height: Math.round(resolveNodeHeight(node)),
  };

  if (node.color) {
    base.color = node.color;
  }

  if (node.type === "group") {
    return {
      ...base,
      type: "group",
      label: node.label || "",
      background: node.background || undefined,
      backgroundStyle: node.backgroundStyle || undefined,
      zmType: "group",
    };
  }

  if (node.type === "link") {
    return {
      ...base,
      type: "link",
      url: node.url || node.content || "",
      title: node.title || "",
      zmType: "link",
    };
  }

  if (node.type === "image") {
    if (isLikelyLocalFile(node.content)) {
      return {
        ...base,
        type: "file",
        file: node.content,
        zmType: "image",
      };
    }

    return {
      ...base,
      type: "link",
      url: node.content || "",
      zmType: "image",
    };
  }

  if (node.type === "file") {
    const file = node.file || node.content || "";
    if (isLikelyLocalFile(file)) {
      return {
        ...base,
        type: "file",
        file,
        title: node.title || "",
        mimeType: normalizeMimeType(node.mimeType) || inferMimeTypeFromFile(file) || undefined,
        fileKind: inferFileKind(node.fileKind || node.mimeType, file),
        size: typeof node.size === "number" ? node.size : undefined,
        zmType: "file",
      };
    }

    return {
      ...base,
      type: "link",
      url: file,
      title: node.title || "",
      zmType: "file",
      mimeType: normalizeMimeType(node.mimeType) || undefined,
      fileKind: inferFileKind(node.fileKind || node.mimeType, file),
    };
  }

  if (node.type === "project") {
    const projectText = [node.title || "", node.desc || "", ...(node.tags || [])].filter(Boolean).join("\n\n");
    return {
      ...base,
      type: "text",
      text: projectText,
      zmType: "project",
      title: node.title || "",
      desc: node.desc || "",
      tags: Array.isArray(node.tags) ? node.tags : [],
    };
  }

  return {
    ...base,
    type: "text",
    text: node.content || "",
    zmType: "text",
  };
}

function importNode(node) {
  const common = {
    id: node.id,
    x: asNumber(node?.x, 0),
    y: asNumber(node?.y, 0),
    w: normalizeWidth(node),
    h: normalizeHeight(node),
    color: typeof node?.color === "string" ? node.color : undefined,
  };

  if (node?.type === "group") {
    return {
      ...common,
      type: "group",
      label: String(node?.label ?? ""),
      background: typeof node?.background === "string" ? node.background : "",
      backgroundStyle: typeof node?.backgroundStyle === "string" ? node.backgroundStyle : "",
    };
  }

  if (node?.type === "file") {
    return {
      ...common,
      type: "file",
      file: String(node?.file ?? ""),
      content: String(node?.file ?? ""),
      title: normalizeFileTitle(node?.title ?? "", node?.file ?? ""),
      mimeType: normalizeMimeType(node?.mimeType) || inferMimeTypeFromFile(node?.file ?? ""),
      fileKind: inferFileKind(node?.fileKind ?? node?.mimeType, node?.file ?? ""),
      size:
        typeof node?.size === "number" && Number.isFinite(node.size) && node.size > 0
          ? Math.round(node.size)
          : undefined,
    };
  }

  if (node?.type === "link" && node?.zmType === "image") {
    return {
      ...common,
      type: "image",
      content: String(node?.url ?? ""),
    };
  }

  if (node?.type === "link" && node?.zmType === "file") {
    return {
      ...common,
      type: "file",
      file: String(node?.url ?? ""),
      content: String(node?.url ?? ""),
      title: normalizeFileTitle(node?.title ?? "", node?.url ?? ""),
      mimeType: normalizeMimeType(node?.mimeType) || inferMimeTypeFromFile(node?.url ?? ""),
      fileKind: inferFileKind(node?.fileKind ?? node?.mimeType, node?.url ?? ""),
      size:
        typeof node?.size === "number" && Number.isFinite(node.size) && node.size > 0
          ? Math.round(node.size)
          : undefined,
    };
  }

  if (node?.type === "link") {
    return {
      ...common,
      type: "link",
      title: String(node?.title ?? ""),
      url: String(node?.url ?? ""),
      content: String(node?.url ?? ""),
    };
  }

  if (node?.zmType === "project") {
    return {
      ...common,
      type: "project",
      title: String(node?.title ?? ""),
      desc: String(node?.desc ?? ""),
      tags: Array.isArray(node?.tags) ? node.tags.map(String) : [],
    };
  }

  return {
    ...common,
    type: "text",
    content: String(node?.text ?? ""),
  };
}

export function exportBoardToJsonCanvas(board) {
  return {
    nodes: sanitizeCanvasNodes(board?.nodes).map(exportNode),
    edges: sanitizeCanvasEdges(board?.edges).map((edge) => ({
      id: edge.id,
      fromNode: edge.from,
      fromSide: edge.fromSide,
      fromEnd: edge.fromEnd,
      toNode: edge.to,
      toSide: edge.toSide,
      toEnd: edge.toEnd,
      color: edge.color,
      label: edge.label,
    })),
  };
}

export function importJsonCanvasToBoardPayload(data) {
  return {
    nodes: sanitizeCanvasNodes(Array.isArray(data?.nodes) ? data.nodes.map(importNode) : []),
    edges: sanitizeCanvasEdges(data?.edges),
  };
}

export function collectNearbyNodes(board, point, limit = 6) {
  if (!point || !Array.isArray(board?.nodes)) return [];

  return sanitizeCanvasNodes(board.nodes)
    .map((node) => {
      const frame = getNodeFrame(node);
      const centerX = frame.x + frame.width / 2;
      const centerY = frame.y + frame.height / 2;
      const dx = centerX - point.x;
      const dy = centerY - point.y;

      return {
        ...node,
        distance: Math.round(Math.hypot(dx, dy)),
      };
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit);
}

export function applyBoardOperations(board, operations) {
  if (!board || !Array.isArray(operations)) return [];

  const applied = [];

  for (const operation of operations) {
    const type = String(operation?.type || "");

    if (type === "addNode" && operation?.node) {
      board.nodes.push(sanitizeCanvasNodes([operation.node])[0]);
      applied.push({ type, id: operation.node.id || null });
      continue;
    }

    if (type === "updateNode" && typeof operation?.id === "string" && operation?.patch) {
      const node = board.nodes.find((item) => item.id === operation.id);
      if (!node) continue;
      Object.assign(node, sanitizeCanvasNodes([{ ...node, ...operation.patch }])[0]);
      applied.push({ type, id: operation.id });
      continue;
    }

    if (type === "removeNode" && typeof operation?.id === "string") {
      const nextNodes = board.nodes.filter((node) => node.id !== operation.id);
      if (nextNodes.length === board.nodes.length) continue;
      board.nodes = nextNodes;
      board.edges = board.edges.filter((edge) => edge.from !== operation.id && edge.to !== operation.id);
      applied.push({ type, id: operation.id });
      continue;
    }

    if (type === "addEdge" && operation?.edge) {
      board.edges.push(sanitizeCanvasEdges([operation.edge])[0]);
      applied.push({ type, id: operation.edge.id || null });
      continue;
    }

    if (type === "removeEdge" && typeof operation?.id === "string") {
      const nextEdges = board.edges.filter((edge) => edge.id !== operation.id);
      if (nextEdges.length === board.edges.length) continue;
      board.edges = nextEdges;
      applied.push({ type, id: operation.id });
    }
  }

  return applied;
}

export function createCanvasNode(type, patch = {}) {
  const prefix = type === "group" ? "group" : "node";
  const id = patch.id || `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const file = String(patch.file ?? patch.content ?? "");
  const fileKind = type === "file" ? inferFileKind(patch.fileKind ?? patch.mimeType, file) : "";
  const defaultWidth = type === "group" ? 420 : type === "file" ? (fileKind === "pdf" ? 360 : 340) : 280;
  const defaultHeight =
    type === "image"
      ? 240
      : type === "file"
        ? fileKind === "pdf"
          ? 420
          : fileKind === "image"
            ? 280
            : 188
        : "auto";

  return sanitizeCanvasNodes([
    {
      id,
      type,
      x: 0,
      y: 0,
      w: defaultWidth,
      h: defaultHeight,
      content: type === "text" ? "Start typing..." : type === "file" ? file : "",
      ...patch,
    },
  ])[0];
}
