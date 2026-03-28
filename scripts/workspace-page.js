import {
  clamp,
  cloneValue,
  createBoardRegistry,
  escapeHtml,
  getCollaborationConfig,
  getProject,
  hydrateBoardFromCloud,
  icon,
  nl2br,
  persistBoard,
  projectDatabase,
  registerRealtimeBoardSync,
  studioData,
} from "./shared/studio-data-client.js";
import {
  applyBoardSnapshot,
  applyBoardOperations,
  collectNearbyNodes,
  createBoardSnapshot,
  createCanvasNode,
  exportBoardToJsonCanvas,
  getNodeFrame,
  importJsonCanvasToBoardPayload,
  pushBoardHistory,
  redoBoard,
  resolveNodeHeight,
  undoBoard,
} from "./shared/workspace-board.js";
import {
  Y,
  WebsocketProvider,
} from "./shared/workspace-collaboration-vendor.js";
import {
  applyBoardPayloadToDoc,
  boardPayloadEquals,
  collectPresenceStates,
  createCollaborationPayloadFromBoard,
  normalizePresenceState,
  readBoardPayloadFromDoc,
} from "./shared/workspace-collaboration.js";
import { setupWebApp } from "./shared/register-web-app.js";

setupWebApp();

const WORKSPACE_STARTERS = [
  "Summarize the selected or nearby cards and add three follow-up notes.",
  "Group the selected cards into one cluster and label it clearly.",
  "Turn the nearby ideas into a simple flow with connecting edges.",
];

const state = {
  boards: createBoardRegistry(),
  collaboration: {
    localPeer: null,
    status: "idle",
    remotePeers: [],
    mode: "disabled",
  },
  canvasContext: {
    mode: "overview",
    projectId: null,
  },
  ui: {
    isContextCollapsed: false,
    isAssistantOpen: false,
    hoveredNodeId: null,
    selectedEdgeId: null,
  },
  pointer: {
    clientX: window.innerWidth * 0.5,
    clientY: window.innerHeight * 0.45,
    worldX: 0,
    worldY: 0,
  },
  selection: {
    nodeIds: [],
    clipboard: null,
    marquee: null,
  },
  interaction: {
    mode: null,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    beforeSnapshot: null,
    changed: false,
    resizeHandle: "",
    nodeId: null,
    edgeDraft: null,
    touchGesture: null,
    marqueeSeed: null,
    preservedSelection: [],
  },
  editing: {
    snapshot: null,
    dirty: false,
  },
  touch: {
    points: {},
  },
  assistant: {
    messages: [
      {
        role: "assistant",
        content:
          "Select cards or focus on an area, then ask me to expand, organize, connect, or rewrite it.",
      },
    ],
    input: "",
    sending: false,
    error: "",
  },
};

const PRESENCE_SYNC_DELAY_MS = 40;
const LOCAL_COLLABORATOR_STORAGE_KEY = "zm-studio-collaborator";
const COLLABORATION_LOCAL_ORIGIN = Symbol("collaboration-local");
let activeCollaborationSession = null;
let pendingPresenceOverrides = {};
let presenceSyncTimer = null;

const canvasViewport = document.getElementById("canvasViewport");
const canvasGrid = document.getElementById("canvasGrid");
const canvasConnections = document.getElementById("canvasConnections");
const canvasStage = document.getElementById("canvasStage");
const collaborationPresenceLayer = document.getElementById("collaborationPresenceLayer");
const canvasBreadcrumb = document.getElementById("canvasBreadcrumb");
const canvasContextKicker = document.getElementById("canvasContextKicker");
const canvasContextTitle = document.getElementById("canvasContextTitle");
const canvasContextCopy = document.getElementById("canvasContextCopy");
const canvasContextMeta = document.getElementById("canvasContextMeta");
const canvasBackBtn = document.getElementById("canvasBackBtn");
const canvasContextToggle = document.getElementById("canvasContextToggle");
const canvasContextToggleLabel = document.getElementById("canvasContextToggleLabel");
const canvasToolbar = document.getElementById("canvasToolbar");
const marqueeSelection = document.getElementById("marqueeSelection");
const zoomValue = document.querySelector("#zoomValue span");
const resetViewBtn = document.getElementById("resetViewBtn");
const assistantToggleBtn = document.getElementById("assistantToggleBtn");
const collaborationStatus = document.getElementById("collaborationStatus");
const assistantCompanion = document.getElementById("assistantCompanion");
const workspaceAssistantPanel = document.getElementById("workspaceAssistantPanel");
const assistantCloseBtn = document.getElementById("assistantCloseBtn");
const assistantContextSummary = document.getElementById("assistantContextSummary");
const assistantStarters = document.getElementById("assistantStarters");
const assistantMessages = document.getElementById("assistantMessages");
const assistantStatus = document.getElementById("assistantStatus");
const assistantInput = document.getElementById("assistantInput");
const assistantSend = document.getElementById("assistantSend");
const assistantComposer = document.getElementById("assistantComposer");
const canvasImportInput = document.getElementById("canvasImportInput");
const addTextNodeBtn = document.getElementById("addTextNodeBtn");
const addLinkNodeBtn = document.getElementById("addLinkNodeBtn");
const addGroupNodeBtn = document.getElementById("addGroupNodeBtn");
const undoCanvasBtn = document.getElementById("undoCanvasBtn");
const redoCanvasBtn = document.getElementById("redoCanvasBtn");
const canvasImportBtn = document.getElementById("canvasImportBtn");
const canvasExportBtn = document.getElementById("canvasExportBtn");

function createLocalCollaborator() {
  const palette = ["#6ee7b7", "#60a5fa", "#f97316", "#facc15", "#f472b6", "#22d3ee"];
  const prefixes = ["Atlas", "Comet", "North", "Echo", "Mosaic", "Orbit"];
  const suffixes = ["Team", "Studio", "Desk", "Flow", "Board", "Lab"];

  try {
    const stored = window.localStorage.getItem(LOCAL_COLLABORATOR_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed?.name === "string" && typeof parsed?.color === "string") {
        return parsed;
      }
    }
  } catch {}

  const index = Math.floor(Math.random() * palette.length);
  const peer = {
    name: `${prefixes[index % prefixes.length]} ${suffixes[(index + 2) % suffixes.length]}`,
    color: palette[index],
  };

  try {
    window.localStorage.setItem(LOCAL_COLLABORATOR_STORAGE_KEY, JSON.stringify(peer));
  } catch {}

  return peer;
}

state.collaboration.localPeer = createLocalCollaborator();

function collaborationWebsocketUrl(config) {
  const endpoint = config?.endpoints?.realtime || "/api/collaboration/ws";
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.host}${endpoint}`;
}

function isRealtimeCollaborationEnabled(config) {
  return Boolean(config?.mode === "server" && config?.features?.realtime && config?.endpoints?.realtime);
}

function syncCollaborationDebug() {
  window.__workspaceCollaboration = {
    boardKey: getActiveBoardKey(),
    mode: state.collaboration.mode,
    status: state.collaboration.status,
    remotePeerCount: state.collaboration.remotePeers.length,
  };
}

function renderCollaborationStatus() {
  if (!collaborationStatus) return;

  collaborationStatus.dataset.state = state.collaboration.status;

  const remoteCount = state.collaboration.remotePeers.length;
  if (state.collaboration.status === "connected") {
    collaborationStatus.textContent = remoteCount > 0 ? `${remoteCount + 1} live` : "Realtime live";
  } else if (state.collaboration.status === "connecting") {
    collaborationStatus.textContent = "Realtime connecting";
  } else if (state.collaboration.status === "disabled") {
    collaborationStatus.textContent = "Realtime off";
  } else {
    collaborationStatus.textContent = "Realtime idle";
  }

  syncCollaborationDebug();
}

function setCollaborationStatus(status, mode = state.collaboration.mode) {
  state.collaboration.status = status;
  state.collaboration.mode = mode;
  renderCollaborationStatus();
}

function currentEditingPresence() {
  const activeElement = document.activeElement;

  if (activeElement?.matches?.("[data-text-node]")) {
    return {
      nodeId: activeElement.dataset.textNode,
      field: "content",
    };
  }

  if (activeElement?.matches?.("[data-link-field]")) {
    return {
      nodeId: activeElement.dataset.nodeId,
      field: activeElement.dataset.linkField || "",
    };
  }

  if (activeElement?.matches?.("[data-group-field]")) {
    return {
      nodeId: activeElement.dataset.nodeId,
      field: activeElement.dataset.groupField || "",
    };
  }

  return null;
}

function buildLocalPresenceState(overrides = {}) {
  return normalizePresenceState({
    user: state.collaboration.localPeer,
    cursor: Object.prototype.hasOwnProperty.call(overrides, "cursor")
      ? overrides.cursor
      : {
          x: state.pointer.worldX,
          y: state.pointer.worldY,
        },
    selection: Object.prototype.hasOwnProperty.call(overrides, "selection")
      ? overrides.selection
      : {
          nodeIds: [...state.selection.nodeIds],
        },
    editing: Object.prototype.hasOwnProperty.call(overrides, "editing") ? overrides.editing : currentEditingPresence(),
  });
}

function flushLocalPresenceSync() {
  presenceSyncTimer = null;
  if (!activeCollaborationSession) return;

  const nextPresence = buildLocalPresenceState(pendingPresenceOverrides);
  pendingPresenceOverrides = {};
  const nextJson = JSON.stringify(nextPresence);

  if (nextJson === activeCollaborationSession.lastPresenceJson) {
    return;
  }

  activeCollaborationSession.lastPresenceJson = nextJson;
  activeCollaborationSession.awareness.setLocalState(nextPresence);
}

function scheduleLocalPresenceSync(overrides = {}) {
  pendingPresenceOverrides = {
    ...pendingPresenceOverrides,
    ...overrides,
  };

  if (presenceSyncTimer) {
    return;
  }

  presenceSyncTimer = window.setTimeout(flushLocalPresenceSync, PRESENCE_SYNC_DELAY_MS);
}

function clearLocalPresenceSync() {
  pendingPresenceOverrides = {};
  if (presenceSyncTimer) {
    window.clearTimeout(presenceSyncTimer);
    presenceSyncTimer = null;
  }
}

function applyRealtimePayloadToBoard(board, payload) {
  const nextPayload = payload || readBoardPayloadFromDoc(activeCollaborationSession.doc, {
    fallback: createCollaborationPayloadFromBoard(board, {
      includeCamera: true,
    }),
  });
  const currentPayload = {
    ...createCollaborationPayloadFromBoard(board, {
      fallback: nextPayload,
      includeCamera: false,
    }),
    camera: nextPayload.camera,
  };

  if (boardPayloadEquals(nextPayload, currentPayload, { includeCamera: false })) {
    return;
  }

  board.title = nextPayload.title;
  board.description = nextPayload.description;
  board.projectId = nextPayload.projectId || board.projectId || null;
  applyBoardSnapshot(board, {
    camera: board.camera,
    nodes: nextPayload.nodes,
    edges: nextPayload.edges,
  });
  state.selection.nodeIds = state.selection.nodeIds.filter((nodeId) => board.nodes.some((node) => node.id === nodeId));
  if (state.ui.selectedEdgeId && !board.edges.some((edge) => edge.id === state.ui.selectedEdgeId)) {
    state.ui.selectedEdgeId = null;
  }
  renderCanvas();
}

function renderCollaborationPresence(board = getActiveBoard()) {
  if (!collaborationPresenceLayer || !board) return;

  const peers = state.collaboration.remotePeers;
  collaborationPresenceLayer.innerHTML = peers
    .flatMap((peer) => {
      const fragments = [];

      if (peer.cursor) {
        const screenX = board.camera.x + peer.cursor.x * board.camera.z;
        const screenY = board.camera.y + peer.cursor.y * board.camera.z;
        fragments.push(`
          <div class="collaboration-cursor" data-client-id="${peer.clientId}" style="left:${screenX}px;top:${screenY}px;--peer-color:${escapeHtml(peer.user.color)};">
            <span class="collaboration-cursor-dot"></span>
            <span class="collaboration-cursor-label">${escapeHtml(peer.user.name)}</span>
          </div>
        `);
      }

      for (const nodeId of peer.selection.nodeIds) {
        const node = board.nodes.find((candidate) => candidate.id === nodeId);
        if (!node) continue;

        const frame = getNodeFrame(node);
        fragments.push(`
          <div
            class="collaboration-selection"
            data-client-id="${peer.clientId}"
            data-node-id="${escapeHtml(nodeId)}"
            style="left:${board.camera.x + frame.x * board.camera.z}px;top:${board.camera.y + frame.y * board.camera.z}px;width:${frame.width * board.camera.z}px;height:${frame.height * board.camera.z}px;--peer-color:${escapeHtml(peer.user.color)};"
          >
            <span class="collaboration-selection-label">${escapeHtml(peer.user.name)}</span>
          </div>
        `);
      }

      if (peer.editing?.nodeId) {
        const node = board.nodes.find((candidate) => candidate.id === peer.editing.nodeId);
        if (node) {
          const frame = getNodeFrame(node);
          const badgeLeft = board.camera.x + (frame.x + frame.width) * board.camera.z - 10;
          const badgeTop = board.camera.y + frame.y * board.camera.z - 12;
          fragments.push(`
            <div
              class="collaboration-editing-badge"
              data-client-id="${peer.clientId}"
              data-node-id="${escapeHtml(peer.editing.nodeId)}"
              style="left:${badgeLeft}px;top:${badgeTop}px;--peer-color:${escapeHtml(peer.user.color)};"
            >
              ${escapeHtml(peer.user.name)} editing
            </div>
          `);
        }
      }

      return fragments;
    })
    .join("");

  renderCollaborationStatus();
}

function destroyActiveCollaborationSession(nextStatus = "idle") {
  clearLocalPresenceSync();

  if (!activeCollaborationSession) {
    state.collaboration.remotePeers = [];
    setCollaborationStatus(nextStatus);
    return;
  }

  registerRealtimeBoardSync(activeCollaborationSession.boardKey, null);

  try {
    activeCollaborationSession.awareness.setLocalState(null);
  } catch {}

  activeCollaborationSession.provider.destroy();
  activeCollaborationSession.doc.destroy();
  activeCollaborationSession = null;
  state.collaboration.remotePeers = [];
  setCollaborationStatus(nextStatus);
  renderCollaborationPresence();
}

function createRealtimeSession(board, config) {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(collaborationWebsocketUrl(config), board.key, doc, {
    disableBc: true,
  });

  const session = {
    boardKey: board.key,
    board,
    doc,
    provider,
    awareness: provider.awareness,
    lastPresenceJson: "",
    synced: false,
    pushBoard(nextBoard) {
      const currentPayload = readBoardPayloadFromDoc(doc, {
        fallback: createCollaborationPayloadFromBoard(nextBoard, {
          includeCamera: true,
        }),
      });
      const nextPayload = {
        ...currentPayload,
        ...createCollaborationPayloadFromBoard(nextBoard, {
          fallback: currentPayload,
          includeCamera: false,
        }),
        camera: currentPayload.camera,
      };

      if (boardPayloadEquals(currentPayload, nextPayload, { includeCamera: false })) {
        return;
      }

      applyBoardPayloadToDoc(doc, nextPayload, {
        origin: COLLABORATION_LOCAL_ORIGIN,
        includeCamera: true,
      });
    },
  };

  doc.on("update", (_update, origin) => {
    if (activeCollaborationSession !== session || origin === COLLABORATION_LOCAL_ORIGIN) {
      return;
    }

    applyRealtimePayloadToBoard(board);
  });

  provider.awareness.on("update", () => {
    if (activeCollaborationSession !== session) {
      return;
    }

    state.collaboration.remotePeers = collectPresenceStates(provider.awareness, doc.clientID);
    renderCollaborationPresence(board);
  });

  provider.on("status", ({ status }) => {
    if (activeCollaborationSession !== session) {
      return;
    }

    setCollaborationStatus(status === "connected" && session.synced ? "connected" : status, "realtime");
  });

  provider.on("sync", (synced) => {
    session.synced = synced;
    if (activeCollaborationSession !== session) {
      return;
    }

    setCollaborationStatus(synced ? "connected" : "connecting", "realtime");
    applyRealtimePayloadToBoard(board);
    scheduleLocalPresenceSync();
  });

  return session;
}

async function ensureRealtimeSession(board) {
  const config = await getCollaborationConfig();

  if (!isRealtimeCollaborationEnabled(config)) {
    destroyActiveCollaborationSession("disabled");
    return null;
  }

  if (activeCollaborationSession?.boardKey === board.key) {
    activeCollaborationSession.board = board;
    registerRealtimeBoardSync(board.key, (nextBoard) => activeCollaborationSession?.pushBoard(nextBoard));
    setCollaborationStatus(
      activeCollaborationSession.synced ? "connected" : activeCollaborationSession.provider.wsconnected ? "connecting" : "idle",
      "realtime",
    );
    scheduleLocalPresenceSync();
    return activeCollaborationSession;
  }

  destroyActiveCollaborationSession("connecting");

  activeCollaborationSession = createRealtimeSession(board, config);
  registerRealtimeBoardSync(board.key, (nextBoard) => activeCollaborationSession?.pushBoard(nextBoard));
  setCollaborationStatus("connecting", "realtime");
  scheduleLocalPresenceSync();
  return activeCollaborationSession;
}

function getActiveBoardKey() {
  return state.canvasContext.mode === "project" && state.canvasContext.projectId
    ? state.canvasContext.projectId
    : "overview";
}

function getActiveBoard() {
  return state.boards[getActiveBoardKey()];
}

function persistActiveBoard() {
  persistBoard(getActiveBoard());
}

async function syncBoardFromCloud(board = getActiveBoard()) {
  if (!board) return;

  const config = await getCollaborationConfig();
  if (isRealtimeCollaborationEnabled(config)) {
    await ensureRealtimeSession(board);
    return;
  }

  destroyActiveCollaborationSession("disabled");
  const boardKey = board.key;
  const payload = await hydrateBoardFromCloud(board);

  if (payload?.board && getActiveBoard()?.key === boardKey) {
    renderCanvas();
  }
}

function ensureProjectBoard(projectId) {
  return state.boards[projectId] || null;
}

function getNodeById(nodeId) {
  return getActiveBoard().nodes.find((node) => node.id === nodeId) || null;
}

function getSelectedNodes(board = getActiveBoard()) {
  return state.selection.nodeIds.map((nodeId) => board.nodes.find((node) => node.id === nodeId)).filter(Boolean);
}

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean))];
}

function setSelectedNodes(nodeIds, options = {}) {
  state.selection.nodeIds = uniqueIds(nodeIds);

  if (!options.preserveEdgeSelection) {
    state.ui.selectedEdgeId = null;
  }

  scheduleLocalPresenceSync({
    selection: {
      nodeIds: [...state.selection.nodeIds],
    },
  });

  if (options.render !== false) {
    renderCanvas();
  }
}

function toggleSelectedNode(nodeId) {
  if (!nodeId) return;

  if (state.selection.nodeIds.includes(nodeId)) {
    setSelectedNodes(state.selection.nodeIds.filter((value) => value !== nodeId));
    return;
  }

  setSelectedNodes([...state.selection.nodeIds, nodeId]);
}

function clearSelection(options = {}) {
  state.selection.nodeIds = [];
  if (!options.preserveEdgeSelection) {
    state.ui.selectedEdgeId = null;
  }
  scheduleLocalPresenceSync({
    selection: {
      nodeIds: [],
    },
  });
  renderCanvas();
}

function selectEdge(edgeId) {
  state.ui.selectedEdgeId = edgeId || null;
  state.selection.nodeIds = [];
  scheduleLocalPresenceSync({
    selection: {
      nodeIds: [],
    },
  });
  renderCanvas();
}

function computeBoardBounds(nodes) {
  let width = 1600;
  let height = 1100;

  for (const node of nodes) {
    const frame = getNodeFrame(node);
    width = Math.max(width, frame.x + frame.width + 260);
    height = Math.max(height, frame.y + frame.height + 260);
  }

  return { width, height };
}

function syncRoute() {
  const url = new URL(window.location.href);

  if (state.canvasContext.mode === "project" && state.canvasContext.projectId) {
    url.searchParams.set("project", state.canvasContext.projectId);
  } else {
    url.searchParams.delete("project");
  }

  window.history.replaceState({}, "", url);
}

function collapseCanvasContext() {
  if (state.ui.isContextCollapsed) return;
  state.ui.isContextCollapsed = true;
  renderCanvas();
}

function expandCanvasContext() {
  if (!state.ui.isContextCollapsed) return;
  state.ui.isContextCollapsed = false;
  renderCanvas();
}

function pointerToWorld(clientX, clientY) {
  const board = getActiveBoard();
  const rect = canvasViewport.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  return {
    x: (localX - board.camera.x) / board.camera.z,
    y: (localY - board.camera.y) / board.camera.z,
  };
}

function syncPointer(clientX, clientY, eventTarget = null) {
  const world = pointerToWorld(clientX, clientY);
  state.pointer.clientX = clientX;
  state.pointer.clientY = clientY;
  state.pointer.worldX = world.x;
  state.pointer.worldY = world.y;
  state.ui.hoveredNodeId = resolveHoveredNodeId(clientX, clientY, eventTarget);
  scheduleLocalPresenceSync({
    cursor: world,
  });
  renderAssistantContext();
}

function resolveHoveredNodeId(clientX, clientY, eventTarget = null) {
  const directNodeId = eventTarget?.closest?.(".canvas-node")?.dataset?.id || null;
  if (directNodeId) {
    return directNodeId;
  }

  return getCanvasNodeIdAtPoint(clientX, clientY);
}

function getCanvasNodeIdAtPoint(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY);

  for (const element of elements) {
    if (
      element?.closest?.(
        ".canvas-context-shell, #canvasContextToggle, #canvasToolbar, #assistantCompanion, #workspaceAssistantPanel",
      )
    ) {
      return null;
    }

    const nodeId = element?.closest?.(".canvas-node")?.dataset?.id || null;
    if (nodeId) {
      return nodeId;
    }
  }

  return null;
}

function edgeAnchor(frame, side) {
  if (side === "top") {
    return { x: frame.x + frame.width / 2, y: frame.y };
  }
  if (side === "bottom") {
    return { x: frame.x + frame.width / 2, y: frame.y + frame.height };
  }
  if (side === "left") {
    return { x: frame.x, y: frame.y + frame.height / 2 };
  }

  return { x: frame.x + frame.width, y: frame.y + frame.height / 2 };
}

function buildConnectionPathFromPoints(start, end) {
  const isMostlyHorizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const curve = Math.max(90, (isMostlyHorizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y)) * 0.35);

  if (isMostlyHorizontal) {
    return `M ${start.x} ${start.y} C ${start.x + curve} ${start.y} ${end.x - curve} ${end.y} ${end.x} ${end.y}`;
  }

  return `M ${start.x} ${start.y} C ${start.x} ${start.y + curve} ${end.x} ${end.y - curve} ${end.x} ${end.y}`;
}

function buildConnectionPath(edge, fromNode, toNode) {
  const start = edgeAnchor(getNodeFrame(fromNode), edge.fromSide || "right");
  const end = edgeAnchor(getNodeFrame(toNode), edge.toSide || "left");
  return buildConnectionPathFromPoints(start, end);
}

function renderCanvasContext(board) {
  const activeProject = state.canvasContext.mode === "project" ? getProject(state.canvasContext.projectId) : null;
  const toggleLabel = activeProject ? `Show ${activeProject.name}` : "Show Overview";

  canvasViewport.classList.toggle("is-context-collapsed", state.ui.isContextCollapsed);
  canvasContextToggle.hidden = !state.ui.isContextCollapsed;
  canvasContextToggle.setAttribute("aria-expanded", String(!state.ui.isContextCollapsed));
  canvasContextToggle.setAttribute("aria-label", toggleLabel);
  canvasContextToggleLabel.textContent = toggleLabel;

  if (activeProject) {
    canvasBackBtn.hidden = false;
    canvasBreadcrumb.textContent = `Canvas / Projects / ${activeProject.name}`;
    canvasContextKicker.textContent = activeProject.id;
    canvasContextTitle.textContent = activeProject.name;
    canvasContextTitle.hidden = false;
    canvasContextCopy.textContent = activeProject.summary;
    canvasContextMeta.innerHTML = [
      `<span class="meta-chip"><span class="meta-chip-label">Location</span>${escapeHtml(activeProject.location)}</span>`,
      `<span class="meta-chip"><span class="meta-chip-label">Year</span>${escapeHtml(activeProject.year)}</span>`,
      `<span class="meta-chip"><span class="meta-chip-label">Status</span>${escapeHtml(activeProject.status)}</span>`,
      `<span class="meta-chip"><span class="meta-chip-label">Deliverables</span>${escapeHtml(String(activeProject.deliverables.length))}</span>`,
    ].join("");
    return;
  }

  canvasBackBtn.hidden = true;
  canvasBreadcrumb.textContent = "Canvas / Overview";
  canvasContextKicker.textContent = "Studio Canvas";
  canvasContextTitle.textContent = "";
  canvasContextTitle.hidden = true;
  canvasContextCopy.textContent = board.description || studioData.studio.description;
  canvasContextMeta.innerHTML = [
    `<span class="meta-chip"><span class="meta-chip-label">Base</span>${escapeHtml(studioData.studio.base)}</span>`,
    `<span class="meta-chip"><span class="meta-chip-label">Projects</span>${escapeHtml(String(projectDatabase.length))}</span>`,
    `<span class="meta-chip"><span class="meta-chip-label">Assets</span>${escapeHtml(String(studioData.assets.length))}</span>`,
    ...studioData.studio.focus.slice(0, 2).map(
      (item) => `<span class="meta-chip"><span class="meta-chip-label">Focus</span>${escapeHtml(item)}</span>`,
    ),
  ].join("");
}

function renderNodeControls(node, isSelected, isHovered) {
  const showPorts = isSelected || isHovered;
  const showResize = isSelected;

  return [
    showPorts
      ? ["top", "right", "bottom", "left"]
          .map(
            (side) =>
              `<button class="node-port" data-port-node="${node.id}" data-side="${side}" type="button" aria-label="Connect ${side}"></button>`,
          )
          .join("")
      : "",
    showResize
      ? ["nw", "ne", "sw", "se"]
          .map(
            (handle) =>
              `<button class="resize-handle" data-resize-node="${node.id}" data-handle="${handle}" type="button" aria-label="Resize ${handle}"></button>`,
          )
          .join("")
      : "",
  ].join("");
}

function renderTextNode(node, className, style, contextMode, isSelected, isHovered) {
  return `
    <div class="${className}" data-id="${node.id}" data-node-type="${node.type}" data-project-context="${contextMode}" style="${style}">
      <div class="drag-handle"></div>
      <textarea class="canvas-textarea" data-text-node="${node.id}" spellcheck="false">${escapeHtml(node.content || "")}</textarea>
      ${renderNodeControls(node, isSelected, isHovered)}
    </div>
  `;
}

function renderProjectNode(node, className, style, contextMode, isSelected, isHovered) {
  const action =
    node.projectId && state.canvasContext.mode !== "project"
      ? `
        <div class="project-card-actions">
          <button class="project-open-btn" data-open-project="${escapeHtml(node.projectId)}" type="button">
            ${icon("arrow")}
            Open Canvas
          </button>
        </div>
      `
      : "";

  return `
    <div class="${className}" data-id="${node.id}" data-node-type="${node.type}" data-project-context="${contextMode}" style="${style}">
      <div class="drag-handle"></div>
      <div class="project-card">
        <div class="project-card-head">
          <h3 class="project-title">${escapeHtml(node.title || "")}</h3>
          ${icon("link")}
        </div>
        <p class="project-copy">${escapeHtml(node.desc || "")}</p>
        <div class="tag-row">
          ${(node.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
        ${action}
      </div>
      ${renderNodeControls(node, isSelected, isHovered)}
    </div>
  `;
}

function renderImageNode(node, className, style, contextMode, isSelected, isHovered) {
  return `
    <div class="${className}" data-id="${node.id}" data-node-type="${node.type}" data-project-context="${contextMode}" style="${style}">
      <img src="${escapeHtml(node.content || "")}" alt="canvas media" draggable="false" />
      ${renderNodeControls(node, isSelected, isHovered)}
    </div>
  `;
}

function renderLinkNode(node, className, style, contextMode, isSelected, isHovered) {
  return `
    <div class="${className} link-node" data-id="${node.id}" data-node-type="${node.type}" data-project-context="${contextMode}" style="${style}">
      <div class="drag-handle"></div>
      <div class="link-card">
        <div class="link-card-head">
          <input class="canvas-inline-input link-title-input" data-node-id="${node.id}" data-link-field="title" value="${escapeHtml(node.title || "Reference link")}" />
          ${icon("arrow")}
        </div>
        <textarea class="canvas-inline-input link-url-input" data-node-id="${node.id}" data-link-field="url" spellcheck="false">${escapeHtml(node.url || "")}</textarea>
      </div>
      ${renderNodeControls(node, isSelected, isHovered)}
    </div>
  `;
}

function renderGroupNode(node, className, style, contextMode, isSelected, isHovered) {
  return `
    <div class="${className} group-node" data-id="${node.id}" data-node-type="${node.type}" data-project-context="${contextMode}" style="${style}">
      <div class="drag-handle"></div>
      <div class="group-node-body">
        <input class="canvas-inline-input group-label-input" data-node-id="${node.id}" data-group-field="label" value="${escapeHtml(node.label || "Cluster")}" />
        <div class="group-node-copy">Group Container</div>
      </div>
      ${renderNodeControls(node, isSelected, isHovered)}
    </div>
  `;
}

function renderDraftEdge(board) {
  const draft = state.interaction.edgeDraft;
  if (!draft) return "";

  const fromNode = board.nodes.find((node) => node.id === draft.fromNodeId);
  if (!fromNode) return "";

  const start = edgeAnchor(getNodeFrame(fromNode), draft.fromSide || "right");
  const targetNode = draft.targetNodeId ? board.nodes.find((node) => node.id === draft.targetNodeId) : null;
  const end = targetNode
    ? edgeAnchor(getNodeFrame(targetNode), draft.toSide || "left")
    : { x: draft.currentWorldX, y: draft.currentWorldY };

  return `<path class="canvas-edge is-draft" d="${buildConnectionPathFromPoints(start, end)}"></path>`;
}

function renderCanvas() {
  const board = getActiveBoard();
  if (!board) return;

  renderCanvasContext(board);

  canvasStage.style.transform = `translate(${board.camera.x}px, ${board.camera.y}px) scale(${board.camera.z})`;
  canvasConnections.style.transform = `translate(${board.camera.x}px, ${board.camera.y}px) scale(${board.camera.z})`;
  canvasGrid.style.backgroundSize = `${40 * board.camera.z}px ${40 * board.camera.z}px`;
  canvasGrid.style.backgroundPosition = `${board.camera.x}px ${board.camera.y}px`;
  canvasGrid.style.setProperty("--dot-size", `${clamp(board.camera.z * 1.3, 0.8, 1.8)}px`);
  zoomValue.textContent = `${Math.round(board.camera.z * 100)}%`;

  const bounds = computeBoardBounds(board.nodes);
  canvasStage.style.width = `${bounds.width}px`;
  canvasStage.style.height = `${bounds.height}px`;
  canvasConnections.setAttribute("width", String(bounds.width));
  canvasConnections.setAttribute("height", String(bounds.height));
  canvasConnections.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);

  const nodesById = new Map(board.nodes.map((node) => [node.id, node]));
  canvasConnections.innerHTML = [
    ...board.edges.map((edge) => {
      const fromNode = nodesById.get(edge.from);
      const toNode = nodesById.get(edge.to);
      if (!fromNode || !toNode) return "";

      const className = ["canvas-edge", state.ui.selectedEdgeId === edge.id ? "is-selected" : ""]
        .filter(Boolean)
        .join(" ");
      return `<path class="${className}" data-edge-id="${edge.id}" d="${buildConnectionPath(edge, fromNode, toNode)}"></path>`;
    }),
    renderDraftEdge(board),
  ].join("");

  canvasStage.innerHTML = board.nodes
    .map((node) => {
      const height = node.h === "auto" ? `${resolveNodeHeight(node)}px` : `${node.h}px`;
      const style = `left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${height};`;
      const isSelected = state.selection.nodeIds.includes(node.id);
      const isHovered = state.ui.hoveredNodeId === node.id;
      const className = [
        "canvas-node",
        node.type === "image" ? "image-node" : "card",
        isSelected ? "is-selected" : "",
        isHovered ? "is-hovered" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const contextMode = escapeHtml(state.canvasContext.mode);

      if (node.type === "text") {
        return renderTextNode(node, className, style, contextMode, isSelected, isHovered);
      }

      if (node.type === "project") {
        return renderProjectNode(node, className, style, contextMode, isSelected, isHovered);
      }

      if (node.type === "link") {
        return renderLinkNode(node, className, style, contextMode, isSelected, isHovered);
      }

      if (node.type === "group") {
        return renderGroupNode(node, className, style, contextMode, isSelected, isHovered);
      }

      return renderImageNode(node, className, style, contextMode, isSelected, isHovered);
    })
    .join("");

  renderMarqueeSelection();
  renderCollaborationPresence(board);
  renderAssistantContext();
}

function renderMarqueeSelection() {
  const marquee = state.selection.marquee;
  if (!marquee) {
    marqueeSelection.hidden = true;
    marqueeSelection.style.width = "0px";
    marqueeSelection.style.height = "0px";
    return;
  }

  marqueeSelection.hidden = false;
  marqueeSelection.style.left = `${marquee.left}px`;
  marqueeSelection.style.top = `${marquee.top}px`;
  marqueeSelection.style.width = `${marquee.width}px`;
  marqueeSelection.style.height = `${marquee.height}px`;
}

function buildThinkingMarkup() {
  return `
    <div class="assistant-thinking" role="status" aria-label="AI is thinking">
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
    </div>
  `;
}

function replacePendingAssistantMessage(content) {
  const pendingIndex = state.assistant.messages.findIndex((message) => message.pending);
  if (pendingIndex === -1) return;

  state.assistant.messages[pendingIndex] = {
    role: "assistant",
    content,
  };
}

function buildAssistantSummary(board = getActiveBoard()) {
  const nearby = collectNearbyNodes(board, { x: state.pointer.worldX, y: state.pointer.worldY }, 3);
  const selected = getSelectedNodes(board);
  const hoveredNode = state.ui.hoveredNodeId ? getNodeById(state.ui.hoveredNodeId) : null;
  const pointerLabel = hoveredNode
    ? `Focus ${hoveredNode.title || hoveredNode.label || hoveredNode.content?.split("\n")[0] || hoveredNode.id}`
    : nearby[0]
      ? `Nearby ${nearby[0].title || nearby[0].label || nearby[0].content?.split("\n")[0] || nearby[0].id}`
      : "No nearby focus yet";
  const selectedLabel = selected.length > 0 ? `${selected.length} node${selected.length > 1 ? "s" : ""} selected` : "No selection";

  return `${pointerLabel}. ${selectedLabel}. Nearby context: ${
    nearby.map((node) => node.title || node.label || node.content?.split("\n")[0] || node.id).join(", ") || "none"
  }.`;
}

function renderAssistantContext() {
  const board = getActiveBoard();
  const summary = buildAssistantSummary(board);
  assistantContextSummary.textContent = summary;

  assistantCompanion.hidden = false;
  workspaceAssistantPanel.hidden = !state.ui.isAssistantOpen;
}

function renderAssistantThread() {
  assistantStarters.innerHTML = WORKSPACE_STARTERS.map(
    (prompt) =>
      `<button class="assistant-starter" data-starter-prompt="${escapeHtml(prompt)}" type="button">${escapeHtml(prompt)}</button>`,
  ).join("");

  assistantMessages.innerHTML = state.assistant.messages
    .map(
      (message) => `
        <article class="assistant-message ${message.role === "user" ? "is-user" : "is-assistant"} ${message.pending ? "is-thinking" : ""}">
          <div class="assistant-message-label">${message.role === "user" ? "You" : "AI"}</div>
          <div class="assistant-message-body">${message.pending ? buildThinkingMarkup() : nl2br(message.content)}</div>
        </article>
      `,
    )
    .join("");

  assistantInput.value = state.assistant.input;
  assistantInput.disabled = state.assistant.sending;
  assistantSend.disabled = state.assistant.sending;

  if (state.assistant.sending) {
    assistantStatus.textContent = "Thinking with the active board…";
  } else if (state.assistant.error) {
    assistantStatus.textContent = state.assistant.error;
  } else {
    assistantStatus.textContent = "Workspace AI ready.";
  }

  assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

function focusAssistantInput() {
  requestAnimationFrame(() => {
    assistantInput?.focus({ preventScroll: true });
    if (typeof assistantInput?.selectionStart === "number") {
      const caret = assistantInput.value.length;
      assistantInput.setSelectionRange(caret, caret);
    }
  });
}

function openAssistantPanel(options = {}) {
  state.ui.isAssistantOpen = true;
  renderAssistantContext();

  if (options.focusInput) {
    focusAssistantInput();
  }
}

function closeAssistantPanel() {
  if (!state.ui.isAssistantOpen) return;
  state.ui.isAssistantOpen = false;
  renderAssistantContext();
}

function toggleAssistantPanel(options = {}) {
  state.ui.isAssistantOpen = !state.ui.isAssistantOpen;
  renderAssistantContext();

  if (state.ui.isAssistantOpen && options.focusInput) {
    focusAssistantInput();
  }
}

function openOverviewCanvas() {
  state.canvasContext = {
    mode: "overview",
    projectId: null,
  };
  state.selection.nodeIds = [];
  state.ui.selectedEdgeId = null;
  syncRoute();
  renderCanvas();
  syncBoardFromCloud(getActiveBoard());
}

function openProjectCanvas(projectId) {
  const board = ensureProjectBoard(projectId);
  if (!board) return;

  state.canvasContext = {
    mode: "project",
    projectId,
  };
  state.selection.nodeIds = [];
  state.ui.selectedEdgeId = null;
  syncRoute();
  renderCanvas();
  syncBoardFromCloud(board);
}

function bringNodesToFront(nodeIds) {
  const board = getActiveBoard();
  const selectedIds = new Set(nodeIds);
  const selectedNodes = board.nodes.filter((node) => selectedIds.has(node.id));
  const others = board.nodes.filter((node) => !selectedIds.has(node.id));
  board.nodes = [...others, ...selectedNodes];
  persistActiveBoard();
}

function beginUndoableInteraction(mode, extras = {}) {
  state.interaction = {
    ...state.interaction,
    mode,
    pointerId: extras.pointerId ?? null,
    lastX: extras.lastX ?? state.pointer.clientX,
    lastY: extras.lastY ?? state.pointer.clientY,
    beforeSnapshot: extras.beforeSnapshot ?? createBoardSnapshot(getActiveBoard()),
    changed: false,
    resizeHandle: extras.resizeHandle || "",
    nodeId: extras.nodeId || null,
    edgeDraft: extras.edgeDraft || null,
    touchGesture: extras.touchGesture || null,
    marqueeSeed: extras.marqueeSeed || null,
    preservedSelection: extras.preservedSelection || [],
    initialFrame: extras.initialFrame || null,
    initialWorld: extras.initialWorld || null,
  };
}

function endCanvasInteraction() {
  const board = getActiveBoard();
  const capturedPointerId = state.interaction.pointerId;

  if (state.interaction.beforeSnapshot && state.interaction.changed) {
    pushBoardHistory(board, state.interaction.beforeSnapshot);
    persistActiveBoard();
  }

  state.interaction = {
    mode: null,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    beforeSnapshot: null,
    changed: false,
    resizeHandle: "",
    nodeId: null,
    edgeDraft: null,
    touchGesture: null,
    marqueeSeed: null,
    preservedSelection: [],
    initialFrame: null,
    initialWorld: null,
  };
  if (capturedPointerId !== null) {
    releaseCanvasPointerCapture(capturedPointerId);
  }
  canvasViewport.classList.remove("is-panning");
  state.selection.marquee = null;
  renderCanvas();
}

function setTouchPoint(pointerId, clientX, clientY) {
  state.touch.points[pointerId] = {
    pointerId,
    clientX,
    clientY,
  };
}

function removeTouchPoint(pointerId) {
  delete state.touch.points[pointerId];
}

function getActiveTouchPoints() {
  return Object.values(state.touch.points).sort((left, right) => left.pointerId - right.pointerId);
}

function touchPointDistance(left, right) {
  return Math.hypot(right.clientX - left.clientX, right.clientY - left.clientY);
}

function touchPointCenter(left, right) {
  return {
    x: (left.clientX + right.clientX) * 0.5,
    y: (left.clientY + right.clientY) * 0.5,
  };
}

function captureCanvasPointer(pointerId) {
  try {
    canvasViewport.setPointerCapture(pointerId);
  } catch {}
}

function releaseCanvasPointerCapture(pointerId) {
  try {
    if (canvasViewport.hasPointerCapture(pointerId)) {
      canvasViewport.releasePointerCapture(pointerId);
    }
  } catch {}
}

function canStartTouchGesture() {
  return !state.interaction.mode || state.interaction.mode === "marquee" || state.interaction.mode === "pan";
}

function beginTouchGestureInteraction() {
  const points = getActiveTouchPoints();
  if (points.length < 2 || !canStartTouchGesture()) return false;

  const board = getActiveBoard();
  const [firstPoint, secondPoint] = points;
  const center = touchPointCenter(firstPoint, secondPoint);
  const centerWorld = pointerToWorld(center.x, center.y);

  beginUndoableInteraction("touch-gesture", {
    beforeSnapshot: createBoardSnapshot(board),
    touchGesture: {
      originCamera: cloneValue(board.camera),
      centerWorld,
      startDistance: Math.max(24, touchPointDistance(firstPoint, secondPoint)),
    },
  });
  canvasViewport.classList.add("is-panning");
  state.selection.marquee = null;
  renderCanvas();
  return true;
}

function updateTouchGestureInteraction() {
  if (state.interaction.mode !== "touch-gesture" || !state.interaction.touchGesture) return;

  const points = getActiveTouchPoints();
  if (points.length < 2) return;

  const [firstPoint, secondPoint] = points;
  const board = getActiveBoard();
  const gesture = state.interaction.touchGesture;
  const center = touchPointCenter(firstPoint, secondPoint);
  const distance = Math.max(24, touchPointDistance(firstPoint, secondPoint));
  const rect = canvasViewport.getBoundingClientRect();
  const localX = center.x - rect.left;
  const localY = center.y - rect.top;
  const nextZoom = clamp(gesture.originCamera.z * (distance / gesture.startDistance), 0.35, 3);
  const nextX = localX - gesture.centerWorld.x * nextZoom;
  const nextY = localY - gesture.centerWorld.y * nextZoom;

  if (nextX !== board.camera.x || nextY !== board.camera.y || nextZoom !== board.camera.z) {
    if ((nextX !== board.camera.x || nextY !== board.camera.y) && !state.ui.isContextCollapsed) {
      collapseCanvasContext();
    }
    board.camera.x = nextX;
    board.camera.y = nextY;
    board.camera.z = nextZoom;
    state.interaction.changed = true;
  }
}

function getNodeRectInWorld(node) {
  const frame = getNodeFrame(node);
  return {
    left: frame.x,
    top: frame.y,
    right: frame.x + frame.width,
    bottom: frame.y + frame.height,
  };
}

function rectFromPoints(first, second) {
  return {
    left: Math.min(first.x, second.x),
    top: Math.min(first.y, second.y),
    right: Math.max(first.x, second.x),
    bottom: Math.max(first.y, second.y),
  };
}

function rectIntersects(left, right) {
  return !(left.right < right.left || left.left > right.right || left.bottom < right.top || left.top > right.bottom);
}

function updateMarqueeSelection(currentWorld, currentClient) {
  const seed = state.interaction.marqueeSeed;
  if (!seed) return;

  const worldRect = rectFromPoints(seed.world, currentWorld);
  const screenRect = rectFromPoints(seed.client, currentClient);
  state.selection.marquee = {
    left: screenRect.left,
    top: screenRect.top,
    width: screenRect.right - screenRect.left,
    height: screenRect.bottom - screenRect.top,
  };

  const board = getActiveBoard();
  const intersectingIds = board.nodes
    .filter((node) => rectIntersects(worldRect, getNodeRectInWorld(node)))
    .map((node) => node.id);

  const nextSelection = seed.append
    ? uniqueIds([...state.interaction.preservedSelection, ...intersectingIds])
    : intersectingIds;

  setSelectedNodes(nextSelection, { render: false });
}

function buildGroupFromSelection() {
  const board = getActiveBoard();
  const selectedNodes = getSelectedNodes(board);

  if (selectedNodes.length === 0) {
    return createCanvasNode("group", {
      x: state.pointer.worldX - 180,
      y: state.pointer.worldY - 120,
      w: 420,
      h: 280,
      label: "Cluster",
    });
  }

  const frames = selectedNodes.map((node) => getNodeFrame(node));
  const left = Math.min(...frames.map((frame) => frame.x));
  const top = Math.min(...frames.map((frame) => frame.y));
  const right = Math.max(...frames.map((frame) => frame.x + frame.width));
  const bottom = Math.max(...frames.map((frame) => frame.y + frame.height));

  return createCanvasNode("group", {
    x: left - 36,
    y: top - 52,
    w: right - left + 72,
    h: bottom - top + 92,
    label: "Cluster",
  });
}

function createNodeAtPointer(type) {
  const baseX = state.pointer.worldX || 180;
  const baseY = state.pointer.worldY || 180;

  if (type === "text") {
    return createCanvasNode("text", {
      x: baseX - 120,
      y: baseY - 80,
      w: 280,
      h: "auto",
      content: "Start typing...",
    });
  }

  if (type === "link") {
    return createCanvasNode("link", {
      x: baseX - 120,
      y: baseY - 80,
      w: 320,
      h: 170,
      title: "Reference link",
      url: "https://",
      content: "https://",
    });
  }

  return buildGroupFromSelection();
}

function addNode(type) {
  const board = getActiveBoard();
  pushBoardHistory(board);

  const node = createNodeAtPointer(type);
  if (type === "group") {
    board.nodes.unshift(node);
  } else {
    board.nodes.push(node);
  }

  persistActiveBoard();
  setSelectedNodes([node.id]);
}

function removeSelection() {
  const board = getActiveBoard();
  const selectedNodeIds = new Set(state.selection.nodeIds);

  if (selectedNodeIds.size === 0 && !state.ui.selectedEdgeId) return;

  pushBoardHistory(board);

  if (selectedNodeIds.size > 0) {
    board.nodes = board.nodes.filter((node) => !selectedNodeIds.has(node.id));
    board.edges = board.edges.filter((edge) => !selectedNodeIds.has(edge.from) && !selectedNodeIds.has(edge.to));
    state.selection.nodeIds = [];
  }

  if (state.ui.selectedEdgeId) {
    board.edges = board.edges.filter((edge) => edge.id !== state.ui.selectedEdgeId);
    state.ui.selectedEdgeId = null;
  }

  persistActiveBoard();
  renderCanvas();
}

function duplicateSelection() {
  const board = getActiveBoard();
  const selectedNodes = getSelectedNodes(board);
  if (selectedNodes.length === 0) return;

  pushBoardHistory(board);

  const idMap = new Map();
  const duplicatedNodes = selectedNodes.map((node) => {
    const nextNode = cloneValue(node);
    nextNode.id = `${node.id}-copy-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    nextNode.x += 48;
    nextNode.y += 48;
    idMap.set(node.id, nextNode.id);
    return nextNode;
  });

  const duplicatedEdges = board.edges
    .filter((edge) => idMap.has(edge.from) && idMap.has(edge.to))
    .map((edge) => ({
      ...cloneValue(edge),
      id: `${edge.id}-copy-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      from: idMap.get(edge.from),
      to: idMap.get(edge.to),
    }));

  board.nodes.push(...duplicatedNodes);
  board.edges.push(...duplicatedEdges);
  persistActiveBoard();
  setSelectedNodes(duplicatedNodes.map((node) => node.id));
}

function copySelection() {
  const board = getActiveBoard();
  const selectedNodes = getSelectedNodes(board);
  if (selectedNodes.length === 0) return;

  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  state.selection.clipboard = {
    nodes: cloneValue(selectedNodes),
    edges: cloneValue(board.edges.filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))),
  };
}

function pasteSelection() {
  const board = getActiveBoard();
  const clipboard = state.selection.clipboard;
  if (!clipboard || !Array.isArray(clipboard.nodes) || clipboard.nodes.length === 0) return;

  pushBoardHistory(board);

  const idMap = new Map();
  const createdNodes = clipboard.nodes.map((node) => {
    const nextNode = cloneValue(node);
    nextNode.id = `${node.id}-paste-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    nextNode.x = nextNode.x + 64;
    nextNode.y = nextNode.y + 64;
    idMap.set(node.id, nextNode.id);
    return nextNode;
  });

  const createdEdges = clipboard.edges.map((edge) => ({
    ...cloneValue(edge),
    id: `${edge.id}-paste-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    from: idMap.get(edge.from),
    to: idMap.get(edge.to),
  }));

  board.nodes.push(...createdNodes);
  board.edges.push(...createdEdges);
  persistActiveBoard();
  setSelectedNodes(createdNodes.map((node) => node.id));
}

function resetView() {
  const board = getActiveBoard();
  pushBoardHistory(board);
  board.camera = cloneValue(board.defaultCamera);
  persistActiveBoard();
  renderCanvas();
}

function applyInitialRoute() {
  const projectId = new URL(window.location.href).searchParams.get("project");
  if (projectId && ensureProjectBoard(projectId)) {
    state.canvasContext = {
      mode: "project",
      projectId,
    };
  }
}

function serializeNodeForAssistant(node) {
  return {
    id: node.id,
    type: node.type,
    x: Math.round(node.x),
    y: Math.round(node.y),
    w: Math.round(node.w),
    h: Math.round(resolveNodeHeight(node)),
    title: node.title || node.label || "",
    content: node.content || node.desc || node.url || "",
    tags: Array.isArray(node.tags) ? node.tags.slice(0, 6) : [],
  };
}

function collectVisibleNodes(board) {
  const viewportRect = canvasViewport.getBoundingClientRect();
  const left = (-board.camera.x) / board.camera.z;
  const top = (-board.camera.y) / board.camera.z;
  const right = left + viewportRect.width / board.camera.z;
  const bottom = top + viewportRect.height / board.camera.z;
  const worldRect = { left, top, right, bottom };

  return board.nodes
    .filter((node) => rectIntersects(worldRect, getNodeRectInWorld(node)))
    .slice(0, 10)
    .map(serializeNodeForAssistant);
}

function collectConnectedNodes(board, nodeIds) {
  const connectedIds = new Set();

  for (const edge of board.edges) {
    if (nodeIds.includes(edge.from)) {
      connectedIds.add(edge.to);
    }
    if (nodeIds.includes(edge.to)) {
      connectedIds.add(edge.from);
    }
  }

  return [...connectedIds]
    .map((nodeId) => board.nodes.find((node) => node.id === nodeId))
    .filter(Boolean)
    .slice(0, 8)
    .map(serializeNodeForAssistant);
}

function buildWorkspaceAssistantRequest() {
  const board = getActiveBoard();
  const nearbyNodes = collectNearbyNodes(board, { x: state.pointer.worldX, y: state.pointer.worldY }, 6);
  const selectedNodes = getSelectedNodes(board);
  const selectedIds = selectedNodes.map((node) => node.id);
  const hoveredNode = state.ui.hoveredNodeId ? getNodeById(state.ui.hoveredNodeId) : null;

  return {
    messages: state.assistant.messages
      .filter((message) => !message.pending)
      .map((message) => ({
        role: message.role,
        content: message.content,
      })),
    board: {
      key: board.key,
      title: board.title,
      description: board.description,
      nodeCount: board.nodes.length,
      edgeCount: board.edges.length,
      nodes: board.nodes.slice(0, 40).map(serializeNodeForAssistant),
      edges: board.edges.slice(0, 60).map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label || "",
      })),
    },
    focus: {
      pointer: {
        x: Math.round(state.pointer.worldX),
        y: Math.round(state.pointer.worldY),
      },
      hoveredNode: hoveredNode ? serializeNodeForAssistant(hoveredNode) : null,
      nearbyNodes: nearbyNodes.map(serializeNodeForAssistant),
      selectedNodes: selectedNodes.map(serializeNodeForAssistant),
      connectedNodes: collectConnectedNodes(board, [...selectedIds, hoveredNode?.id].filter(Boolean)),
      visibleNodes: collectVisibleNodes(board),
    },
  };
}

async function sendAssistantMessage(rawText) {
  const content = rawText.trim();
  if (!content || state.assistant.sending) return;

  state.ui.isAssistantOpen = true;
  state.assistant.messages.push({ role: "user", content });
  state.assistant.messages.push({
    role: "assistant",
    content: "",
    pending: true,
  });
  state.assistant.input = "";
  state.assistant.error = "";
  state.assistant.sending = true;
  renderAssistantThread();
  renderAssistantContext();

  try {
    const response = await fetch("/api/workspace-assistant", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(buildWorkspaceAssistantRequest()),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Workspace AI request failed with status ${response.status}.`);
    }

    const board = getActiveBoard();
    const operations = Array.isArray(payload.operations) ? payload.operations : [];
    let applied = [];

    if (operations.length > 0) {
      const beforeSnapshot = createBoardSnapshot(board);
      applied = applyBoardOperations(board, operations);

      if (applied.length > 0) {
        pushBoardHistory(board, beforeSnapshot);
        persistActiveBoard();
        renderCanvas();
      }
    }

    const suffix =
      applied.length > 0 ? `\n\nApplied ${applied.length} canvas change${applied.length > 1 ? "s" : ""}.` : "";
    replacePendingAssistantMessage((payload.reply || "I couldn't produce a reply just now.") + suffix);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workspace AI is currently unavailable.";
    state.assistant.error = message;
    replacePendingAssistantMessage(`The workspace assistant could not respond right now.\n\n${message}`);
  } finally {
    state.assistant.sending = false;
    renderAssistantThread();
    renderAssistantContext();
  }
}

async function handleImportFile(file) {
  if (!file) return;

  const source = await file.text();
  const parsed = JSON.parse(source);
  const payload = importJsonCanvasToBoardPayload(parsed);
  const board = getActiveBoard();

  pushBoardHistory(board);
  board.nodes = payload.nodes;
  board.edges = payload.edges;
  state.selection.nodeIds = [];
  state.ui.selectedEdgeId = null;
  persistActiveBoard();
  renderCanvas();
}

function triggerExport() {
  const board = getActiveBoard();
  const payload = exportBoardToJsonCanvas(board);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${board.key}.canvas`;
  anchor.click();
  URL.revokeObjectURL(url);
}

canvasBackBtn?.addEventListener("click", () => {
  openOverviewCanvas();
});

canvasContextToggle?.addEventListener("click", () => {
  expandCanvasContext();
});

assistantCompanion?.addEventListener("click", () => {
  openAssistantPanel({ focusInput: true });
});

assistantToggleBtn?.addEventListener("click", () => {
  toggleAssistantPanel({ focusInput: state.ui.isAssistantOpen === false });
});

assistantCloseBtn?.addEventListener("click", () => {
  closeAssistantPanel();
});

addTextNodeBtn?.addEventListener("click", () => {
  addNode("text");
});

addLinkNodeBtn?.addEventListener("click", () => {
  addNode("link");
});

addGroupNodeBtn?.addEventListener("click", () => {
  addNode("group");
});

undoCanvasBtn?.addEventListener("click", () => {
  if (undoBoard(getActiveBoard())) {
    persistActiveBoard();
    renderCanvas();
  }
});

redoCanvasBtn?.addEventListener("click", () => {
  if (redoBoard(getActiveBoard())) {
    persistActiveBoard();
    renderCanvas();
  }
});

canvasImportBtn?.addEventListener("click", () => {
  canvasImportInput.click();
});

canvasImportInput?.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;

  try {
    await handleImportFile(file);
  } catch (error) {
    state.assistant.error = error instanceof Error ? error.message : "Import failed.";
    renderAssistantThread();
  } finally {
    event.target.value = "";
  }
});

canvasExportBtn?.addEventListener("click", () => {
  triggerExport();
});

assistantStarters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-starter-prompt]");
  if (!button) return;
  void sendAssistantMessage(button.dataset.starterPrompt || "");
});

assistantInput?.addEventListener("input", (event) => {
  state.assistant.input = event.target.value;
});

assistantInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void sendAssistantMessage(state.assistant.input);
  }
});

assistantComposer?.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendAssistantMessage(state.assistant.input);
});

canvasViewport.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") {
    setTouchPoint(event.pointerId, event.clientX, event.clientY);
  }
  syncPointer(event.clientX, event.clientY, event.target);

  if (event.pointerType === "touch" && getActiveTouchPoints().length >= 2 && canStartTouchGesture()) {
    beginTouchGestureInteraction();
  }

  if (!state.interaction.mode) return;

  if (
    state.interaction.mode !== "touch-gesture" &&
    state.interaction.pointerId !== null &&
    event.pointerId !== state.interaction.pointerId
  ) {
    return;
  }

  if (state.interaction.mode === "touch-gesture") {
    updateTouchGestureInteraction();
    renderCanvas();
    return;
  }

  const board = getActiveBoard();
  const dx = event.clientX - state.interaction.lastX;
  const dy = event.clientY - state.interaction.lastY;
  const world = pointerToWorld(event.clientX, event.clientY);

  if (state.interaction.mode === "pan") {
    if ((dx !== 0 || dy !== 0) && !state.ui.isContextCollapsed) {
      collapseCanvasContext();
    }
    board.camera.x += dx;
    board.camera.y += dy;
    state.interaction.changed = true;
  }

  if (state.interaction.mode === "drag") {
    const selectedNodes = getSelectedNodes(board);
    for (const node of selectedNodes) {
      node.x += dx / board.camera.z;
      node.y += dy / board.camera.z;
    }
    state.interaction.changed = true;
  }

  if (state.interaction.mode === "marquee") {
    updateMarqueeSelection(world, {
      x: event.clientX - canvasViewport.getBoundingClientRect().left,
      y: event.clientY - canvasViewport.getBoundingClientRect().top,
    });
  }

  if (state.interaction.mode === "resize") {
    const node = getNodeById(state.interaction.nodeId);
    const frame = state.interaction.initialFrame;
    const origin = state.interaction.initialWorld;
    if (node && frame && origin) {
      const deltaX = world.x - origin.x;
      const deltaY = world.y - origin.y;
      let nextX = frame.x;
      let nextY = frame.y;
      let nextW = frame.w;
      let nextH = frame.h;

      if (state.interaction.resizeHandle.includes("e")) {
        nextW = frame.w + deltaX;
      }
      if (state.interaction.resizeHandle.includes("s")) {
        nextH = frame.h + deltaY;
      }
      if (state.interaction.resizeHandle.includes("w")) {
        nextW = frame.w - deltaX;
        nextX = frame.x + deltaX;
      }
      if (state.interaction.resizeHandle.includes("n")) {
        nextH = frame.h - deltaY;
        nextY = frame.y + deltaY;
      }

      nextW = Math.max(140, Math.round(nextW));
      nextH = Math.max(node.type === "group" ? 180 : 110, Math.round(nextH));

      if (state.interaction.resizeHandle.includes("w")) {
        nextX = frame.x + (frame.w - nextW);
      }
      if (state.interaction.resizeHandle.includes("n")) {
        nextY = frame.y + (frame.h - nextH);
      }

      node.x = Math.round(nextX);
      node.y = Math.round(nextY);
      node.w = nextW;
      node.h = nextH;
      state.interaction.changed = true;
    }
  }

  if (state.interaction.mode === "edge" && state.interaction.edgeDraft) {
    const hoveredNode = getCanvasNodeIdAtPoint(event.clientX, event.clientY);
    state.interaction.edgeDraft.currentWorldX = world.x;
    state.interaction.edgeDraft.currentWorldY = world.y;
    state.interaction.edgeDraft.targetNodeId =
      hoveredNode && hoveredNode !== state.interaction.edgeDraft.fromNodeId ? hoveredNode : null;
  }

  state.interaction.lastX = event.clientX;
  state.interaction.lastY = event.clientY;
  renderCanvas();
});

canvasViewport.addEventListener("pointerdown", (event) => {
  syncPointer(event.clientX, event.clientY, event.target);

  if (event.target.closest(".canvas-context-shell")) return;
  if (event.target.closest("#canvasContextToggle")) return;
  if (event.target.closest("#canvasToolbar")) return;
  if (event.target.closest("#assistantCompanion")) return;
  if (event.target.closest("#workspaceAssistantPanel")) return;
  if (event.target.closest("[data-open-project]")) return;

  if (event.pointerType === "touch") {
    setTouchPoint(event.pointerId, event.clientX, event.clientY);
    captureCanvasPointer(event.pointerId);

    if (beginTouchGestureInteraction()) {
      return;
    }

    if (getActiveTouchPoints().length > 1) {
      return;
    }
  }

  const portButton = event.target.closest("[data-port-node]");
  if (portButton) {
    const fromNodeId = portButton.dataset.portNode;
    const fromSide = portButton.dataset.side || "right";
    beginUndoableInteraction("edge", {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      edgeDraft: {
        fromNodeId,
        fromSide,
        currentWorldX: state.pointer.worldX,
        currentWorldY: state.pointer.worldY,
        targetNodeId: null,
        toSide: fromSide === "left" ? "right" : fromSide === "right" ? "left" : "top",
      },
      beforeSnapshot: createBoardSnapshot(getActiveBoard()),
    });
    captureCanvasPointer(event.pointerId);
    renderCanvas();
    return;
  }

  const resizeHandle = event.target.closest("[data-resize-node]");
  if (resizeHandle) {
    const nodeId = resizeHandle.dataset.resizeNode;
    const node = getNodeById(nodeId);
    if (!node) return;

    beginUndoableInteraction("resize", {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      nodeId,
      resizeHandle: resizeHandle.dataset.handle || "se",
      initialFrame: {
        x: node.x,
        y: node.y,
        w: node.w,
        h: resolveNodeHeight(node),
      },
      initialWorld: pointerToWorld(event.clientX, event.clientY),
      beforeSnapshot: createBoardSnapshot(getActiveBoard()),
    });
    captureCanvasPointer(event.pointerId);
    return;
  }

  const nodeElement = event.target.closest(".canvas-node");
  const isEditableField = event.target.matches("textarea,input");

  if (nodeElement && isEditableField) {
    const nodeId = nodeElement.dataset.id;
    if (nodeId && !state.selection.nodeIds.includes(nodeId)) {
      state.selection.nodeIds = [nodeId];
      state.ui.selectedEdgeId = null;
      scheduleLocalPresenceSync({
        selection: {
          nodeIds: [nodeId],
        },
      });
    }
    return;
  }

  if (nodeElement && !isEditableField) {
    const nodeId = nodeElement.dataset.id;

    if (event.shiftKey) {
      toggleSelectedNode(nodeId);
      return;
    }

    if (!state.selection.nodeIds.includes(nodeId)) {
      setSelectedNodes([nodeId], { render: false });
    }

    bringNodesToFront(state.selection.nodeIds);
    beginUndoableInteraction("drag", {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      nodeId,
      beforeSnapshot: createBoardSnapshot(getActiveBoard()),
    });
    captureCanvasPointer(event.pointerId);
    renderCanvas();
    return;
  }

  if (event.button === 1) {
    beginUndoableInteraction("pan", {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      beforeSnapshot: createBoardSnapshot(getActiveBoard()),
    });
    canvasViewport.classList.add("is-panning");
    captureCanvasPointer(event.pointerId);
    return;
  }

  beginUndoableInteraction("marquee", {
    pointerId: event.pointerId,
    lastX: event.clientX,
    lastY: event.clientY,
    beforeSnapshot: null,
    preservedSelection: [...state.selection.nodeIds],
    marqueeSeed: {
      append: event.shiftKey,
      world: { x: state.pointer.worldX, y: state.pointer.worldY },
      client: {
        x: event.clientX - canvasViewport.getBoundingClientRect().left,
        y: event.clientY - canvasViewport.getBoundingClientRect().top,
      },
    },
  });
  if (!event.shiftKey) {
    state.selection.nodeIds = [];
    state.ui.selectedEdgeId = null;
  }
  captureCanvasPointer(event.pointerId);
  renderCanvas();
});

canvasViewport.addEventListener("pointerup", (event) => {
  if (event.pointerType === "touch") {
    removeTouchPoint(event.pointerId);
    releaseCanvasPointerCapture(event.pointerId);

    if (state.interaction.mode === "touch-gesture") {
      if (getActiveTouchPoints().length < 2) {
        endCanvasInteraction();
      }
      return;
    }
  }

  if (
    state.interaction.mode &&
    state.interaction.mode !== "touch-gesture" &&
    state.interaction.pointerId !== null &&
    event.pointerId !== state.interaction.pointerId
  ) {
    return;
  }

  const board = getActiveBoard();

  if (state.interaction.mode === "edge" && state.interaction.edgeDraft) {
    const draft = state.interaction.edgeDraft;
    const targetNodeId = draft.targetNodeId || getCanvasNodeIdAtPoint(event.clientX, event.clientY);
    const duplicateEdge = board.edges.find((edge) => edge.from === draft.fromNodeId && edge.to === targetNodeId);
    if (targetNodeId && targetNodeId !== draft.fromNodeId && !duplicateEdge) {
      board.edges.push({
        id: `edge-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        from: draft.fromNodeId,
        to: targetNodeId,
        fromSide: draft.fromSide,
        toSide: draft.toSide,
        fromEnd: "none",
        toEnd: "arrow",
        label: "",
      });
      state.interaction.changed = true;
    }
  }

  endCanvasInteraction();
});

canvasViewport.addEventListener("pointercancel", (event) => {
  if (event.pointerType === "touch") {
    removeTouchPoint(event.pointerId);
    releaseCanvasPointerCapture(event.pointerId);
  }

  if (
    state.interaction.mode &&
    state.interaction.mode !== "touch-gesture" &&
    state.interaction.pointerId !== null &&
    event.pointerId !== state.interaction.pointerId
  ) {
    return;
  }
  endCanvasInteraction();
});

canvasViewport.addEventListener("pointerleave", (event) => {
  scheduleLocalPresenceSync({
    cursor: null,
  });
  if (state.interaction.mode && !canvasViewport.hasPointerCapture(event.pointerId)) {
    endCanvasInteraction();
  }
});

canvasViewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    syncPointer(event.clientX, event.clientY, event.target);

    const board = getActiveBoard();
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      if ((event.deltaX !== 0 || event.deltaY !== 0) && !state.ui.isContextCollapsed) {
        collapseCanvasContext();
      }
      board.camera.x -= event.deltaX;
      board.camera.y -= event.deltaY;
      persistActiveBoard();
      renderCanvas();
      return;
    }

    const rect = canvasViewport.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const worldX = (localX - board.camera.x) / board.camera.z;
    const worldY = (localY - board.camera.y) / board.camera.z;
    const nextZoom = clamp(board.camera.z * Math.exp(-event.deltaY * 0.0014), 0.35, 3);

    board.camera.x = localX - worldX * nextZoom;
    board.camera.y = localY - worldY * nextZoom;
    board.camera.z = nextZoom;

    persistActiveBoard();
    renderCanvas();
  },
  { passive: false },
);

canvasViewport.addEventListener("dblclick", (event) => {
  if (event.target.closest(".canvas-node")) return;
  if (event.target.closest(".canvas-context-shell")) return;
  if (event.target.closest("#canvasToolbar")) return;
  if (event.target.closest("#workspaceAssistantPanel")) return;

  syncPointer(event.clientX, event.clientY, event.target);
  addNode("text");
});

canvasStage.addEventListener("click", (event) => {
  const projectButton = event.target.closest("[data-open-project]");
  if (projectButton) {
    event.preventDefault();
    event.stopPropagation();
    openProjectCanvas(projectButton.dataset.openProject || "");
    return;
  }
});

canvasConnections.addEventListener("click", (event) => {
  const edgeElement = event.target.closest("[data-edge-id]");
  if (!edgeElement) return;

  state.ui.selectedEdgeId = edgeElement.dataset.edgeId || null;
  state.selection.nodeIds = [];
  scheduleLocalPresenceSync({
    selection: {
      nodeIds: [],
    },
  });
  renderCanvas();
});

canvasStage.addEventListener("focusin", (event) => {
  if (!event.target.matches("[data-text-node], [data-link-field], [data-group-field]")) return;
  state.editing.snapshot = createBoardSnapshot(getActiveBoard());
  state.editing.dirty = false;
  scheduleLocalPresenceSync({
    editing: currentEditingPresence(),
  });
});

canvasStage.addEventListener("focusout", (event) => {
  if (!event.target.matches("[data-text-node], [data-link-field], [data-group-field]")) return;
  if (state.editing.snapshot && state.editing.dirty) {
    pushBoardHistory(getActiveBoard(), state.editing.snapshot);
    persistActiveBoard();
  }
  state.editing.snapshot = null;
  state.editing.dirty = false;
  scheduleLocalPresenceSync({
    editing: null,
  });
});

canvasStage.addEventListener("input", (event) => {
  const board = getActiveBoard();
  const nodeId = event.target.dataset.nodeId || event.target.dataset.textNode;
  const node = board.nodes.find((item) => item.id === nodeId);
  if (!node) return;

  if (event.target.matches("[data-text-node]")) {
    node.content = event.target.value;
  }

  if (event.target.matches("[data-link-field='title']")) {
    node.title = event.target.value;
  }

  if (event.target.matches("[data-link-field='url']")) {
    node.url = event.target.value;
    node.content = event.target.value;
  }

  if (event.target.matches("[data-group-field='label']")) {
    node.label = event.target.value;
  }

  state.editing.dirty = true;
  scheduleLocalPresenceSync({
    editing: currentEditingPresence(),
  });
  persistActiveBoard();
});

resetViewBtn?.addEventListener("click", () => {
  resetView();
});

window.addEventListener("resize", () => {
  renderCanvas();
});

window.addEventListener("popstate", () => {
  const projectId = new URL(window.location.href).searchParams.get("project");
  if (projectId && ensureProjectBoard(projectId)) {
    openProjectCanvas(projectId);
    return;
  }
  openOverviewCanvas();
});

window.addEventListener("keydown", (event) => {
  const target = document.activeElement;
  const isTypingTarget = target?.matches?.("textarea, input");

  if (event.code === "Space" && !isTypingTarget) {
    event.preventDefault();
    if (!event.repeat) {
      openAssistantPanel({ focusInput: true });
    }
    return;
  }

  if (isTypingTarget) {
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    const action = event.shiftKey ? redoBoard : undoBoard;
    if (action(getActiveBoard())) {
      persistActiveBoard();
      renderCanvas();
    }
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateSelection();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
    event.preventDefault();
    copySelection();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
    event.preventDefault();
    pasteSelection();
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    removeSelection();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    state.selection.nodeIds = [];
    state.ui.selectedEdgeId = null;
    state.selection.marquee = null;
    scheduleLocalPresenceSync({
      selection: {
        nodeIds: [],
      },
      editing: null,
    });
    if (state.ui.isAssistantOpen) {
      closeAssistantPanel();
      return;
    }
    renderCanvas();
  }
});

window.addEventListener("beforeunload", () => {
  destroyActiveCollaborationSession("idle");
});

applyInitialRoute();
syncRoute();
renderAssistantThread();
renderCollaborationStatus();
renderCanvas();
syncBoardFromCloud(getActiveBoard());
