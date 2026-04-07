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
import {
  appendPendingAssistantMessage,
  consumeAssistantEventReader,
  finalizePendingAssistantMessage,
  focusAssistantInput,
  getPendingAssistantIndex,
  renderAssistantMessages,
  renderAssistantStarters,
  replacePendingAssistantMessage,
  serializeAssistantMessages,
  shouldOpenAssistantFromSpace,
} from "./shared/assistant-shell.js";
import { setupWebApp } from "./shared/register-web-app.js?v=2026-03-30-auth-1";

setupWebApp();

const APP_CSS_ID = "workspace-app-css";
const APP_CSS_URL = "./scripts/generated/workspace/workspace-app.css";
const APP_MODULE_URL = "./generated/workspace/workspace-app.js?v=" + Date.now();
const WORKSPACE_ENGINE_MODE = new URL(window.location.href).searchParams.get("workspace-engine") || "compat";
const IS_TLDRAW_PRIMARY_MODE = WORKSPACE_ENGINE_MODE === "tldraw";

// Tell the embedded tldraw app whether clipboard events should be handled by compat-mode handlers
window.__workspaceClipboardMode = IS_TLDRAW_PRIMARY_MODE ? "tldraw" : "compat";

window.__workspaceApp = {
  engine: "tldraw",
  ready: false,
  status: "booting",
  currentToolId: "select",
  pageSelectedNodeIds: [],
  pageSelectedEdgeIds: [],
};

function ensureWorkspaceAppCss() {
  if (document.getElementById(APP_CSS_ID)) return;

  const link = document.createElement("link");
  link.id = APP_CSS_ID;
  link.rel = "stylesheet";
  link.href = APP_CSS_URL;
  document.head.appendChild(link);
}

async function mountWorkspaceEngine() {
  const root = document.getElementById("workspaceCanvasApp");
  if (!root) return;

  if (typeof globalThis.process !== "object") {
    globalThis.process = {
      env: {
        NODE_ENV: "production",
        TLDRAW_ENV: "production",
        VITE_TLDRAW_LICENSE_KEY: "",
      },
      emit() {},
    };
  } else {
    globalThis.process.env = {
      NODE_ENV: "production",
      TLDRAW_ENV: "production",
      VITE_TLDRAW_LICENSE_KEY: "",
      ...globalThis.process.env,
    };
    if (typeof globalThis.process.emit !== "function") {
      globalThis.process.emit = () => {};
    }
  }

  ensureWorkspaceAppCss();
  const module = await import(APP_MODULE_URL);
  if (typeof module.mountWorkspaceApp !== "function") {
    throw new Error("Workspace app bundle does not export mountWorkspaceApp().");
  }

  window.__workspaceApp = {
    engine: "tldraw",
    ready: false,
    status: "mounting",
    currentToolId: window.__workspaceApp?.currentToolId || "select",
    pageSelectedNodeIds: window.__workspaceApp?.pageSelectedNodeIds || [],
    pageSelectedEdgeIds: window.__workspaceApp?.pageSelectedEdgeIds || [],
  };

  module.mountWorkspaceApp({ root });
}

function createWorkspaceBridgePayload(board) {
  if (!board) return null;

  return {
    key: board.key,
    title: board.title || "Workspace",
    description: board.description || "",
    camera: cloneValue(board.camera),
    defaultCamera: cloneValue(board.defaultCamera || board.camera),
    nodes: cloneValue(board.nodes),
    edges: cloneValue(board.edges),
  };
}

const WORKSPACE_STATIC_AI_HINT =
  "Workspace AI requires a server backend. GitHub Pages serves the static canvas only.";
const WORKSPACE_STATIC_AI_RECOVERY =
  "Workspace AI requires a server backend. GitHub Pages serves the static canvas only. Deploy `/api/workspace-assistant` on a Node-capable host to enable it.";

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
    pendingFocus: null,
  },
  touch: {
    points: {},
  },
  assistant: {
    messages: [
      {
        role: "assistant",
        content:
          "Select one or more nodes and press Space to start. I'll focus on the selected nodes while understanding the full canvas.",
      },
    ],
    input: "",
    sending: false,
    error: "",
    backendReady: false,
    showStarters: true,
    contextNodeIds: [],
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
const workspaceCanvasApp = document.getElementById("workspaceCanvasApp");

// ── Miro-style clipboard trap ──────────────────────────────────────────────
// Browsers only fire the `paste` event (with clipboardData.files populated)
// when a *focusable, editable* element has focus.  A bare <div> canvas won't
// trigger it, which is why Cmd+V from Finder silently does nothing.
// Miro solves this with a tiny off-screen contenteditable div that is always
// focused when the canvas surface itself is active.  We replicate that here.
const clipboardTrap = (() => {
  const el = document.createElement("div");
  el.setAttribute("contenteditable", "true");
  el.setAttribute("data-clipboard-trap", "true");
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("tabindex", "-1");
  Object.assign(el.style, {
    position: "fixed",
    left: "-9999px",
    top: "-9999px",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
    overflow: "hidden",
    whiteSpace: "pre",
    // prevent any layout shift
    contain: "strict",
  });
  // Insert into canvasViewport so it lives inside the canvas DOM subtree
  if (canvasViewport) {
    canvasViewport.appendChild(el);
  } else {
    document.body.appendChild(el);
  }
  return el;
})();

/**
 * Focus the clipboard trap so that the next Cmd+V / Cmd+C produces a real
 * ClipboardEvent with clipboardData populated (including .files from Finder).
 * Only steals focus when no other editable field is active.
 */
function focusClipboardTrap() {
  const active = document.activeElement;
  // Don't steal focus from real inputs / textareas / contenteditable fields
  if (
    active &&
    active !== document.body &&
    active !== clipboardTrap &&
    active.matches("textarea, input, [contenteditable='true']:not([data-clipboard-trap])")
  ) {
    return;
  }
  // Clear any leftover text so it doesn't interfere with paste data
  clipboardTrap.textContent = "\u200B"; // zero-width space keeps caret alive
  clipboardTrap.focus({ preventScroll: true });
}
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
const workspaceAssistantBody = document.getElementById("workspaceAssistantBody");
const assistantContextSummary = document.getElementById("assistantContextSummary");
const assistantStartersRegion = document.getElementById("assistantStartersRegion");
const assistantStarters = document.getElementById("assistantStarters");
const assistantTimeline = document.getElementById("assistantTimeline");
const assistantMessages = document.getElementById("assistantMessages");
const assistantStatus = document.getElementById("assistantStatus");
const assistantInput = document.getElementById("assistantInput");
const assistantSend = document.getElementById("assistantSend");
const assistantComposer = document.getElementById("assistantComposer");
const canvasImportInput = document.getElementById("canvasImportInput");
const canvasFileInput = document.getElementById("canvasFileInput");
const addTextNodeBtn = document.getElementById("addTextNodeBtn");
const addFileNodeBtn = document.getElementById("addFileNodeBtn");
const addLinkNodeBtn = document.getElementById("addLinkNodeBtn");
const addGroupNodeBtn = document.getElementById("addGroupNodeBtn");
const connectNodesBtn = document.getElementById("connectNodesBtn");
const undoCanvasBtn = document.getElementById("undoCanvasBtn");
const redoCanvasBtn = document.getElementById("redoCanvasBtn");
const canvasImportBtn = document.getElementById("canvasImportBtn");
const canvasExportBtn = document.getElementById("canvasExportBtn");
const TEXT_NODE_MIN_TEXTAREA_HEIGHT = 148;
const TEXT_NODE_MIN_FRAME_HEIGHT = 170;
const TEXT_NODE_CHROME_HEIGHT = 22;
let suppressNextWorkspaceAppSync = false;
const transientCanvasToolState = {
  spaceHandActive: false,
  restoreToolId: "select",
};

canvasViewport?.classList.toggle("is-tldraw-primary", IS_TLDRAW_PRIMARY_MODE);

function syncWorkspaceApp(board = getActiveBoard()) {
  if (suppressNextWorkspaceAppSync) {
    suppressNextWorkspaceAppSync = false;
    return;
  }

  const payload = createWorkspaceBridgePayload(board);
  window.__workspaceBoardState = payload;

  if (payload && window.__workspaceAppBridge?.setBoardPayload) {
    window.__workspaceAppBridge.setBoardPayload(payload);
  }
}

function updateCanvasToolbarToolState(toolId = window.__workspaceApp?.currentToolId || "select") {
  if (!connectNodesBtn) return;

  const isConnectActive = toolId === "arrow";
  connectNodesBtn.classList.toggle("is-active", isConnectActive);
  connectNodesBtn.setAttribute("aria-pressed", String(isConnectActive));
}

function beginTemporaryHandTool() {
  if (!IS_TLDRAW_PRIMARY_MODE || !window.__workspaceAppBridge?.setTool) return false;
  if (transientCanvasToolState.spaceHandActive) return true;

  transientCanvasToolState.spaceHandActive = true;
  transientCanvasToolState.restoreToolId = window.__workspaceApp?.currentToolId || "select";
  window.__workspaceAppBridge.setTool("hand");
  return true;
}

function endTemporaryHandTool() {
  if (!transientCanvasToolState.spaceHandActive || !window.__workspaceAppBridge?.setTool) return;

  const restoreToolId =
    transientCanvasToolState.restoreToolId && transientCanvasToolState.restoreToolId !== "hand"
      ? transientCanvasToolState.restoreToolId
      : "select";

  transientCanvasToolState.spaceHandActive = false;
  transientCanvasToolState.restoreToolId = "select";
  window.__workspaceAppBridge.setTool(restoreToolId);
}

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

  if (activeElement?.matches?.("[data-file-field]")) {
    return {
      nodeId: activeElement.dataset.nodeId,
      field: activeElement.dataset.fileField || "",
    };
  }

  return null;
}

function queueTextNodeFocus(nodeId, options = {}) {
  if (!nodeId) return;

  state.editing.pendingFocus = {
    nodeId,
    selectAll: options.selectAll !== false,
  };
}

function syncTextNodeAutoHeight(field, node = null) {
  if (!field?.matches?.("[data-text-node]")) return;
  if (node && node.h !== "auto") return;

  const nodeElement = field.closest(".canvas-node");
  const dragHandleHeight =
    nodeElement?.querySelector(".drag-handle")?.getBoundingClientRect?.().height || TEXT_NODE_CHROME_HEIGHT;

  field.style.height = "0px";
  const nextFieldHeight = Math.max(TEXT_NODE_MIN_TEXTAREA_HEIGHT, Math.ceil(field.scrollHeight));
  field.style.height = `${nextFieldHeight}px`;

  const nextNodeHeight = Math.max(TEXT_NODE_MIN_FRAME_HEIGHT, Math.ceil(dragHandleHeight + nextFieldHeight));
  if (nodeElement) {
    nodeElement.style.height = `${nextNodeHeight}px`;
  }

  if (node) {
    node.autoHeight = nextNodeHeight;
  }
}

function syncRenderedTextNodeHeights(board = getActiveBoard()) {
  if (!board) return;

  for (const field of canvasStage.querySelectorAll(".canvas-textarea[data-text-node]")) {
    const node = board.nodes.find((item) => item.id === field.dataset.textNode);
    syncTextNodeAutoHeight(field, node || null);
  }
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

  if (IS_TLDRAW_PRIMARY_MODE && options.syncAppSelection !== false) {
    window.__workspaceAppBridge?.selectNodeIds?.(state.selection.nodeIds);
  }

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

  if (IS_TLDRAW_PRIMARY_MODE && options.syncAppSelection !== false) {
    window.__workspaceAppBridge?.selectNodeIds?.([]);
  }
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

  if (IS_TLDRAW_PRIMARY_MODE) {
    window.__workspaceAppBridge?.selectNodeIds?.([]);
  }
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

function resolveTargetSide(fromNode, toNode) {
  if (!fromNode || !toNode) {
    return "left";
  }

  const fromFrame = getNodeFrame(fromNode);
  const toFrame = getNodeFrame(toNode);
  const deltaX = toFrame.x + toFrame.width / 2 - (fromFrame.x + fromFrame.width / 2);
  const deltaY = toFrame.y + toFrame.height / 2 - (fromFrame.y + fromFrame.height / 2);

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? "left" : "right";
  }

  return deltaY >= 0 ? "top" : "bottom";
}

function flushPendingEditorFocus() {
  const pendingFocus = state.editing.pendingFocus;
  if (!pendingFocus?.nodeId) return;

  const textarea = canvasStage.querySelector(`.canvas-textarea[data-text-node="${pendingFocus.nodeId}"]`);
  if (!textarea) return;

  textarea.focus({ preventScroll: true });

  if (pendingFocus.selectAll) {
    textarea.setSelectionRange(0, textarea.value.length);
  }

  state.editing.pendingFocus = null;
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
  const showPorts = true;
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

function formatFileSize(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

function fileKindLabel(node) {
  if (node.fileKind === "pdf") return "PDF";
  if (node.fileKind === "image") return "Image";
  return "File";
}

function renderFileNode(node, className, style, contextMode, isSelected, isHovered) {
  const fileUrl = escapeHtml(node.file || node.content || "");
  const title = escapeHtml(node.title || "Attachment");
  const sizeLabel = formatFileSize(node.size);
  const caption = [node.mimeType || "", sizeLabel].filter(Boolean).join(" · ");
  const preview =
    node.fileKind === "image"
      ? `
        <div class="file-node-preview" data-file-preview-kind="image">
          <img src="${fileUrl}" alt="${title}" draggable="false" />
        </div>
      `
      : node.fileKind === "pdf"
        ? `
          <div class="file-node-preview" data-file-preview-kind="pdf">
            <iframe src="${fileUrl}#view=FitH" title="${title}" loading="lazy"></iframe>
          </div>
        `
        : `
          <div class="file-node-preview" data-file-preview-kind="other">
            <div>
              ${icon("box")}
              <div>${escapeHtml(node.mimeType || "Preview unavailable")}</div>
            </div>
          </div>
        `;

  return `
    <div class="${className} file-node" data-id="${node.id}" data-node-type="${node.type}" data-project-context="${contextMode}" style="${style}">
      <div class="drag-handle"></div>
      <div class="file-node-shell">
        <div class="file-node-head">
          <div class="file-node-labels">
            <div class="file-node-kicker">Attachment</div>
            <h3 class="file-node-title">${title}</h3>
          </div>
          <span class="file-node-pill">${fileKindLabel(node)}</span>
        </div>
        ${preview}
        <div class="file-node-meta">
          <div class="file-node-caption">${escapeHtml(caption || "Stored on this board")}</div>
          <a class="file-node-action" data-node-action href="${fileUrl}" target="_blank" rel="noreferrer">
            ${icon("arrow")}
            Open
          </a>
        </div>
      </div>
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
      const d = buildConnectionPath(edge, fromNode, toNode);
      // Invisible wider hitarea path for easier clicking, plus the visible path
      return `<path class="canvas-edge-hitarea" data-edge-id="${edge.id}" d="${d}"></path><path class="${className}" data-edge-id="${edge.id}" d="${d}"></path>`;
    }),
    renderDraftEdge(board),
  ].join("");

  canvasStage.innerHTML = board.nodes
    .map((node) => {
      const height = node.h === "auto" ? `${resolveNodeHeight(node)}px` : `${node.h}px`;
      const style = `left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${height};`;
      const isSelected = state.selection.nodeIds.includes(node.id);
      const isHovered = state.ui.hoveredNodeId === node.id;
      const isAiContext = state.assistant.contextNodeIds.includes(node.id);
      const className = [
        "canvas-node",
        ...(node.type === "image" ? ["image-node"] : ["card"]),
        isSelected ? "is-selected" : "",
        isHovered ? "is-hovered" : "",
        isAiContext ? "is-ai-context" : "",
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

      if (node.type === "file") {
        return renderFileNode(node, className, style, contextMode, isSelected, isHovered);
      }

      return renderImageNode(node, className, style, contextMode, isSelected, isHovered);
    })
    .join("");

  syncRenderedTextNodeHeights(board);
  renderMarqueeSelection();
  renderCollaborationPresence(board);
  renderAssistantContext();
  flushPendingEditorFocus();
  syncWorkspaceApp(board);
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

function buildAssistantSummary(board = getActiveBoard()) {
  const contextIds = state.assistant.contextNodeIds;
  const contextNodes = contextIds
    .map((id) => board.nodes.find((n) => n.id === id))
    .filter(Boolean);

  if (contextNodes.length > 0) {
    const labels = contextNodes.map(
      (node) => node.title || node.label || node.content?.split("\n")[0] || node.id
    );
    return `AI Context: ${labels.join(", ")}. Full canvas loaded (${board.nodes.length} nodes, ${board.edges.length} edges).`;
  }

  return `Full canvas loaded (${board.nodes.length} nodes, ${board.edges.length} edges). Select nodes and press Space to focus AI.`;
}

function renderAssistantContext() {
  const board = getActiveBoard();
  const summary = buildAssistantSummary(board);
  assistantContextSummary.textContent = summary;

  // Show context node count badge in the companion button
  const contextCount = state.assistant.contextNodeIds.length;
  assistantCompanion.hidden = false;
  assistantCompanion.dataset.contextCount = String(contextCount);
  assistantCompanion.classList.toggle("has-context", contextCount > 0);
  workspaceAssistantPanel.hidden = !state.ui.isAssistantOpen;
  workspaceAssistantBody?.setAttribute("data-assistant-open", state.ui.isAssistantOpen ? "true" : "false");
}

function renderAssistantThread() {
  assistantTimeline?.setAttribute("aria-busy", state.assistant.sending ? "true" : "false");
  assistantStartersRegion.dataset.state = state.assistant.showStarters ? "visible" : "hidden";
  assistantStartersRegion.hidden = !state.assistant.showStarters;
  assistantStarters.innerHTML = renderAssistantStarters(WORKSPACE_STARTERS, escapeHtml);
  assistantMessages.innerHTML = renderAssistantMessages(state.assistant.messages, { nl2br });

  assistantInput.value = state.assistant.input;
  assistantInput.disabled = state.assistant.sending;
  assistantSend.disabled = state.assistant.sending;

  if (state.assistant.sending) {
    assistantStatus.textContent = "Thinking with the active board…";
  } else if (state.assistant.error) {
    assistantStatus.textContent = state.assistant.error;
  } else if (state.assistant.backendReady) {
    assistantStatus.textContent = "Workspace AI backend connected.";
  } else {
    assistantStatus.textContent = WORKSPACE_STATIC_AI_HINT;
  }

  assistantTimeline.scrollTop = assistantTimeline.scrollHeight;
}

function openAssistantPanel(options = {}) {
  // Lock current selection as AI context nodes
  if (options.lockContext !== false && state.selection.nodeIds.length > 0) {
    state.assistant.contextNodeIds = [...state.selection.nodeIds];
  }
  state.ui.isAssistantOpen = true;
  renderAssistantThread();
  renderCanvas();
  renderAssistantContext();

  if (options.focusInput) {
    focusAssistantInput(assistantInput);
  }
}

function closeAssistantPanel() {
  if (!state.ui.isAssistantOpen) return;
  state.ui.isAssistantOpen = false;
  state.assistant.contextNodeIds = [];
  renderCanvas();
  renderAssistantContext();
}

function clearAiContext() {
  state.assistant.contextNodeIds = [];
  renderCanvas();
  renderAssistantContext();
}

function toggleAssistantPanel(options = {}) {
  if (state.ui.isAssistantOpen) {
    closeAssistantPanel();
  } else {
    openAssistantPanel(options);
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
  if (IS_TLDRAW_PRIMARY_MODE && window.__workspaceAppBridge?.addNode) {
    window.__workspaceAppBridge.addNode(type, {
      x: state.pointer.worldX || 180,
      y: state.pointer.worldY || 180,
    });
    return;
  }

  const board = getActiveBoard();
  pushBoardHistory(board);

  const node = createNodeAtPointer(type);
  if (type === "group") {
    board.nodes.unshift(node);
  } else {
    board.nodes.push(node);
  }

  persistActiveBoard();
  if (type === "text") {
    queueTextNodeFocus(node.id, { selectAll: node.content === "Start typing..." });
  }
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

  // Also write to system clipboard so content can be pasted externally
  const textParts = selectedNodes.map((node) => {
    if (node.type === "link") return [node.title || "Reference link", node.url || node.content || ""].filter(Boolean).join("\n");
    if (node.type === "group") return node.label || "Cluster";
    if (node.type === "file") return [node.title || "Attachment", node.file || node.content || ""].filter(Boolean).join("\n");
    if (node.type === "project") return [node.title || "", node.desc || node.content || ""].filter(Boolean).join("\n");
    return node.content || node.title || "";
  });
  const plainText = textParts.join("\n\n").trim() || " ";
  const clipboardPayload = JSON.stringify({
    __zmWorkspaceClipboard: true,
    nodes: cloneValue(selectedNodes),
    edges: cloneValue(board.edges.filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))),
  });
  const htmlContent = `<div data-zm-workspace-clipboard="${encodeURIComponent(clipboardPayload)}"><pre>${escapeHtml(plainText)}</pre></div>`;

  try {
    const clipboard = window.navigator?.clipboard;
    if (clipboard && typeof clipboard.write === "function" && typeof ClipboardItem !== "undefined") {
      clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([htmlContent], { type: "text/html" }),
        }),
      ]).catch(() => {});
    } else if (clipboard && typeof clipboard.writeText === "function") {
      clipboard.writeText(plainText).catch(() => {});
    }
  } catch {}
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

function normalizeClipboardTextCompat(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function normalizeClipboardUrlCompat(value) {
  const trimmed = normalizeClipboardTextCompat(value);
  if (!trimmed) return null;
  try {
    const nextUrl = trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
    const parsed = new URL(nextUrl);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseZmWorkspaceClipboardFromHtml(html) {
  if (!html) return null;
  try {
    const match = html.match(/data-zm-workspace-clipboard="([^"]*)"/i);
    if (!match) return null;
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded);
    if (parsed?.__zmWorkspaceClipboard && Array.isArray(parsed.nodes)) {
      return parsed;
    }
  } catch {}
  return null;
}

/**
 * Convert an image file (e.g., TIFF from macOS Finder) to PNG using canvas.
 * Browsers can decode TIFF into an Image element but cannot display them in <img> tags.
 * This mimics how Miro converts clipboard images to web-compatible formats.
 */
function convertImageFileToPng(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (blob) {
              const pngFile = new File([blob], file.name.replace(/\.\w+$/, ".png") || `paste-${Date.now()}.png`, {
                type: "image/png",
              });
              resolve(pngFile);
            } else {
              // Conversion failed, return original
              resolve(file);
            }
          },
          "image/png",
          1.0,
        );
      } catch {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // If the browser can't decode the image, return original
      resolve(file);
    };

    img.src = url;
  });
}

function pasteExternalTextCompat(text) {
  const normalizedText = normalizeClipboardTextCompat(text);
  if (!normalizedText) return;

  const board = getActiveBoard();
  pushBoardHistory(board);

  // Use viewport center for consistent positioning; snap to 20px grid
  const center = getCanvasViewportCenterWorldPoint();
  const baseX = Math.round((center.x) / 20) * 20;
  const baseY = Math.round((center.y) / 20) * 20;
  const url = normalizeClipboardUrlCompat(normalizedText);

  let node;
  if (url) {
    node = createCanvasNode("link", {
      x: baseX - 160,
      y: baseY - 85,
      w: 320,
      h: 170,
      title: url,
      url,
      content: url,
    });
  } else {
    node = createCanvasNode("text", {
      x: baseX - 140,
      y: baseY - 80,
      w: 280,
      h: "auto",
      content: normalizedText,
    });
  }

  board.nodes.push(node);
  persistActiveBoard();
  setSelectedNodes([node.id]);
}

async function pasteFromSystemClipboardCompat() {
  const clipboard = window.navigator?.clipboard;
  if (!clipboard) {
    pasteSelection();
    return;
  }

  try {
    if (typeof clipboard.read === "function") {
      const items = await clipboard.read();
      if (Array.isArray(items) && items.length > 0) {
        // FIRST PASS: Check for files/images across ALL items before checking text
        // This is critical because copying a file from Finder puts both
        // the filename (as text) and file data in the clipboard.
        const collectedFiles = [];
        for (const item of items) {
          const fileTypes = item.types.filter((type) => type.startsWith("image/") || type === "application/pdf");
          for (const fileType of fileTypes) {
            try {
              const blob = await item.getType(fileType);
              const ext = fileType.split("/")[1] || "bin";
              collectedFiles.push(new File([blob], `paste-${Date.now()}-${collectedFiles.length}.${ext}`, { type: fileType }));
            } catch {}
          }
        }
        if (collectedFiles.length > 0) {
          await handleCanvasFiles(collectedFiles, { worldPoint: { x: state.pointer.worldX || 180, y: state.pointer.worldY || 180 } });
          return;
        }

        // SECOND PASS: Check for workspace clipboard data or text
        for (const item of items) {
          const htmlType = item.types.find((type) => type === "text/html");
          if (htmlType) {
            const htmlBlob = await item.getType(htmlType);
            const html = await htmlBlob.text();
            const zmPayload = parseZmWorkspaceClipboardFromHtml(html);
            if (zmPayload) {
              state.selection.clipboard = {
                nodes: cloneValue(zmPayload.nodes),
                edges: cloneValue(zmPayload.edges || []),
              };
              pasteSelection();
              return;
            }

            const extractedText = normalizeClipboardTextCompat(
              new DOMParser().parseFromString(html, "text/html").body.textContent || ""
            );
            if (extractedText) {
              pasteExternalTextCompat(extractedText);
              return;
            }
          }

          const plainTextType = item.types.find((type) => type === "text/plain");
          if (plainTextType) {
            const textBlob = await item.getType(plainTextType);
            const pastedText = normalizeClipboardTextCompat(await textBlob.text());
            if (pastedText) {
              pasteExternalTextCompat(pastedText);
              return;
            }
          }
        }
      }
    }

    // Fallback: try readText
    if (typeof clipboard.readText === "function") {
      const pastedText = normalizeClipboardTextCompat(await clipboard.readText());
      if (pastedText) {
        pasteExternalTextCompat(pastedText);
        return;
      }
    }
  } catch (error) {
    console.error("Unable to read from system clipboard.", error);
  }

  // Final fallback: use internal clipboard
  pasteSelection();
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
    // Include file/image URLs for multimodal context
    file: node.file || "",
    fileKind: node.fileKind || "",
    mimeType: node.mimeType || "",
  };
}

/**
 * Compact serialization for non-context nodes.
 * Only sends enough for the AI to know what exists and where,
 * without the full content payload.
 */
function serializeNodeCompact(node) {
  const label = node.title || node.label || node.content?.split("\n")[0]?.slice(0, 60) || "";
  return {
    id: node.id,
    type: node.type,
    x: Math.round(node.x),
    y: Math.round(node.y),
    label,
  };
}

/**
 * Build a cached canvas digest string.
 * This gives the AI a high-level understanding of the full canvas
 * without sending all raw node data every time.
 */
function buildCanvasDigest(board) {
  const typeCounts = {};
  for (const node of board.nodes) {
    typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
  }

  const typeBreakdown = Object.entries(typeCounts)
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");

  const nodeLabels = board.nodes
    .map((n) => {
      const label = n.title || n.label || n.content?.split("\n")[0]?.slice(0, 40) || n.id;
      return `[${n.type}] ${label}`;
    })
    .join("; ");

  return `Canvas "${board.title || board.key}": ${board.nodes.length} nodes (${typeBreakdown}), ${board.edges.length} edges. Nodes: ${nodeLabels}`;
}

// Cache for canvas digest to avoid recomputing on every request
let cachedDigest = { boardKey: null, nodeCount: 0, edgeCount: 0, digest: "" };

function getCanvasDigest(board) {
  // Invalidate cache if board structure changed
  if (
    cachedDigest.boardKey === board.key &&
    cachedDigest.nodeCount === board.nodes.length &&
    cachedDigest.edgeCount === board.edges.length
  ) {
    return cachedDigest.digest;
  }

  cachedDigest = {
    boardKey: board.key,
    nodeCount: board.nodes.length,
    edgeCount: board.edges.length,
    digest: buildCanvasDigest(board),
  };

  return cachedDigest.digest;
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
    .map(serializeNodeCompact);
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
  const contextIds = state.assistant.contextNodeIds;
  const contextIdSet = new Set(contextIds);
  const contextNodes = contextIds
    .map((id) => board.nodes.find((n) => n.id === id))
    .filter(Boolean);
  const selectedNodes = getSelectedNodes(board);

  // Tiered serialization: full data for context nodes, compact for the rest
  const allNodes = board.nodes.map((node) =>
    contextIdSet.has(node.id)
      ? serializeNodeForAssistant(node)
      : serializeNodeCompact(node)
  );

  return {
    messages: state.assistant.messages
      .filter((message) => !message.pending)
      .map((message) => ({
        role: message.role,
        content: message.content,
      })),
    board: {
      key: board.key,
      projectId: board.projectId || "",
      title: board.title,
      description: board.description,
      nodeCount: board.nodes.length,
      edgeCount: board.edges.length,
      digest: getCanvasDigest(board),
      nodes: allNodes,
      edges: board.edges.map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label || "",
      })),
    },
    focus: {
      contextNodeIds: contextIds,
      contextNodes: contextNodes.map(serializeNodeForAssistant),
      selectedNodes: selectedNodes.map(serializeNodeForAssistant),
      connectedNodes: collectConnectedNodes(board, contextIds.length > 0 ? contextIds : selectedNodes.map((n) => n.id)),
      visibleNodes: collectVisibleNodes(board),
    },
  };
}

function applyWorkspaceAssistantOperations(operations) {
  const board = getActiveBoard();
  const normalizedOperations = Array.isArray(operations) ? operations : [];
  if (normalizedOperations.length === 0) {
    return [];
  }

  const beforeSnapshot = createBoardSnapshot(board);
  const applied = applyBoardOperations(board, normalizedOperations);

  if (applied.length > 0) {
    pushBoardHistory(board, beforeSnapshot);
    persistActiveBoard();
    renderCanvas();
  }

  return applied;
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
    streaming: true,
  });
  state.assistant.input = "";
  state.assistant.error = "";
  state.assistant.sending = true;
  state.assistant.showStarters = false;
  renderAssistantThread();
  renderAssistantContext();

  try {
    const response = await fetch("/api/workspace-assistant", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...buildWorkspaceAssistantRequest(),
        stream: true,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Workspace AI request failed with status ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream") && response.body?.getReader) {
      const reader = response.body.getReader();
      let sawChunk = false;
      let streamError = "";
      let donePayload = null;

      await consumeAssistantEventReader(reader, {
        onChunk(payload) {
          appendPendingAssistantMessage(state.assistant.messages, payload.delta);
          state.assistant.backendReady = true;
          sawChunk = true;
          renderAssistantThread();
        },
        onError(payload) {
          streamError = typeof payload.error === "string" ? payload.error : "Workspace AI stream failed.";
        },
        onDone(payload) {
          donePayload = payload;
        },
      });

      if (streamError) {
        state.assistant.error = streamError;
        const pendingIndex = getPendingAssistantIndex(state.assistant.messages);
        const pendingMessage = pendingIndex === -1 ? null : state.assistant.messages[pendingIndex];
        if (pendingMessage?.content) {
          finalizePendingAssistantMessage(state.assistant.messages, pendingMessage.content);
        } else {
          replacePendingAssistantMessage(
            state.assistant.messages,
            `The workspace assistant could not respond right now.\n\n${streamError}`,
          );
        }
        return;
      }

      if (!sawChunk) {
        throw new Error("Workspace AI stream ended before any content arrived.");
      }

      finalizePendingAssistantMessage(state.assistant.messages);
      const applied = applyWorkspaceAssistantOperations(donePayload?.operations);
      if (applied.length > 0) {
        const latestIndex = state.assistant.messages.length - 1;
        state.assistant.messages[latestIndex] = {
          role: "assistant",
          content: `${state.assistant.messages[latestIndex].content}\n\nApplied ${applied.length} canvas change${applied.length > 1 ? "s" : ""}.`,
        };
      }
    } else {
      const payload = await response.json().catch(() => ({}));
      state.assistant.backendReady = true;
      const applied = applyWorkspaceAssistantOperations(payload.operations);
      const suffix =
        applied.length > 0 ? `\n\nApplied ${applied.length} canvas change${applied.length > 1 ? "s" : ""}.` : "";
      replacePendingAssistantMessage(
        state.assistant.messages,
        (payload.reply || "I couldn't produce a reply just now.") + suffix,
      );
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Workspace AI is currently unavailable.";
    const message =
      /status 404|failed to fetch|load failed/i.test(rawMessage) ? WORKSPACE_STATIC_AI_RECOVERY : rawMessage;
    state.assistant.error = message;
    const pendingIndex = getPendingAssistantIndex(state.assistant.messages);
    const pendingMessage = pendingIndex === -1 ? null : state.assistant.messages[pendingIndex];
    if (pendingMessage?.content) {
      finalizePendingAssistantMessage(state.assistant.messages, pendingMessage.content);
    } else {
      replacePendingAssistantMessage(state.assistant.messages, `The workspace assistant could not respond right now.\n\n${message}`);
    }
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

async function uploadWorkspaceFile(file, boardKey) {
  const config = await getCollaborationConfig();
  const endpoint = config?.endpoints?.uploads || "/api/uploads";
  // HTTP headers only support ISO-8859-1 characters.
  // macOS produces filenames with non-ASCII chars (e.g. 截屏 in Chinese screenshots).
  // URL-encode the filename to safely pass it through the header.
  const safeFileName = encodeURIComponent(file.name || "upload.bin");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-board-key": boardKey,
      "x-file-name": safeFileName,
    },
    body: file,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Upload failed with status ${response.status}.`);
  }

  if (!payload?.upload?.url) {
    throw new Error("Upload response did not include a file URL.");
  }

  return payload.upload;
}

function createFileNodeFromUpload(upload, worldPoint, index = 0, intrinsicSize = null) {
  const fileKind = upload.fileKind || "other";
  // The file node has header (drag handle 22px + title ~55px) and footer (meta ~48px)
  // that take space outside the image preview area.
  const NODE_CHROME_HEIGHT = 125;

  let width, height;
  if (fileKind === "image" && intrinsicSize && intrinsicSize.w > 0 && intrinsicSize.h > 0) {
    // Preserve the real image aspect ratio, capped to a reasonable canvas size
    const MAX_W = 400;
    const MAX_PREVIEW_H = 500;
    const ratio = intrinsicSize.w / intrinsicSize.h;
    width = Math.min(intrinsicSize.w, MAX_W);
    let previewH = Math.round(width / ratio);
    if (previewH > MAX_PREVIEW_H) {
      previewH = MAX_PREVIEW_H;
      width = Math.round(previewH * ratio);
    }
    // Minimum size
    width = Math.max(width, 180);
    previewH = Math.max(previewH, 80);
    height = previewH + NODE_CHROME_HEIGHT;
  } else if (fileKind === "pdf") {
    width = 360;
    height = 420;
  } else if (fileKind === "image") {
    // Fallback if dimensions couldn't be probed
    width = 340;
    height = 280;
  } else {
    width = 340;
    height = 188;
  }

  return createCanvasNode("file", {
    x: Math.round(worldPoint.x - width / 2 + index * 26),
    y: Math.round(worldPoint.y - height / 2 + index * 22),
    w: width,
    h: height,
    file: upload.url,
    content: upload.url,
    title: upload.originalName || upload.storedName || "Attachment",
    mimeType: upload.mimeType || "",
    fileKind,
    size: typeof upload.size === "number" ? upload.size : undefined,
  });
}

/**
 * Load an image URL and return its natural dimensions.
 * Returns { w, h } or null if the image fails to load.
 */
function probeImageDimensions(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      resolve(null);
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timer);
      resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

async function insertFileNodes(files, options = {}) {
  // Accept files even if name is empty (macOS clipboard can produce unnamed files)
  const attachments = Array.from(files || []).filter((file) => file && file.size > 0);
  if (attachments.length === 0) return;

  const board = getActiveBoard();
  const worldPoint = options.worldPoint || {
    x: state.pointer.worldX || 180,
    y: state.pointer.worldY || 180,
  };
  const uploads = [];

  state.assistant.error = "";
  renderAssistantThread();

  for (const file of attachments) {
    uploads.push(await uploadWorkspaceFile(file, board.key));
  }

  if (uploads.length === 0) return;

  // Probe real image dimensions so nodes match the actual aspect ratio
  const dimensions = await Promise.all(
    uploads.map((upload) =>
      upload.fileKind === "image" && upload.url ? probeImageDimensions(upload.url) : null
    )
  );

  pushBoardHistory(board);
  const createdNodes = uploads.map((upload, index) =>
    createFileNodeFromUpload(upload, worldPoint, index, dimensions[index])
  );
  board.nodes.push(...createdNodes);
  persistActiveBoard();
  setSelectedNodes(createdNodes.map((node) => node.id));
  renderCanvas();
}

async function handleCanvasFiles(files, options = {}) {
  try {
    await insertFileNodes(files, options);
  } catch (error) {
    state.assistant.error = error instanceof Error ? error.message : "Attachment upload failed.";
    renderAssistantThread();
  }
}

function getCanvasViewportCenterWorldPoint() {
  const rect = canvasViewport.getBoundingClientRect();
  return pointerToWorld(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
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

addFileNodeBtn?.addEventListener("click", () => {
  canvasFileInput?.click();
});

addLinkNodeBtn?.addEventListener("click", () => {
  addNode("link");
});

addGroupNodeBtn?.addEventListener("click", () => {
  addNode("group");
});

connectNodesBtn?.addEventListener("click", () => {
  if (!IS_TLDRAW_PRIMARY_MODE || !window.__workspaceAppBridge?.setTool) return;

  const currentToolId = window.__workspaceApp?.currentToolId || "select";
  const nextToolId = currentToolId === "arrow" ? "select" : "arrow";
  transientCanvasToolState.spaceHandActive = false;
  transientCanvasToolState.restoreToolId = "select";
  window.__workspaceAppBridge.setTool(nextToolId);
});

undoCanvasBtn?.addEventListener("click", () => {
  if (IS_TLDRAW_PRIMARY_MODE && window.__workspaceAppBridge?.undo) {
    window.__workspaceAppBridge.undo();
    return;
  }

  if (undoBoard(getActiveBoard())) {
    persistActiveBoard();
    renderCanvas();
  }
});

redoCanvasBtn?.addEventListener("click", () => {
  if (IS_TLDRAW_PRIMARY_MODE && window.__workspaceAppBridge?.redo) {
    window.__workspaceAppBridge.redo();
    return;
  }

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

canvasFileInput?.addEventListener("change", async (event) => {
  const files = [...(event.target.files || [])];
  if (files.length === 0) return;

  await handleCanvasFiles(files);
  event.target.value = "";
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
  if (IS_TLDRAW_PRIMARY_MODE) {
    syncPointer(event.clientX, event.clientY, event.target);
    return;
  }

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
    if (state.interaction.edgeDraft.targetNodeId) {
      const board = getActiveBoard();
      const fromNode = board.nodes.find((node) => node.id === state.interaction.edgeDraft.fromNodeId);
      const toNode = board.nodes.find((node) => node.id === state.interaction.edgeDraft.targetNodeId);
      state.interaction.edgeDraft.toSide = resolveTargetSide(fromNode, toNode);
    }
  }

  state.interaction.lastX = event.clientX;
  state.interaction.lastY = event.clientY;
  renderCanvas();
});

canvasViewport.addEventListener("pointerdown", (event) => {
  if (IS_TLDRAW_PRIMARY_MODE) {
    syncPointer(event.clientX, event.clientY, event.target);
    return;
  }

  syncPointer(event.clientX, event.clientY, event.target);

  if (event.target.closest(".canvas-context-shell")) return;
  if (event.target.closest("#canvasContextToggle")) return;
  if (event.target.closest("#canvasToolbar")) return;
  if (event.target.closest("#assistantCompanion")) return;
  if (event.target.closest("#workspaceAssistantPanel")) return;
  if (event.target.closest("[data-open-project]")) return;
  if (event.target.closest("[data-node-action]")) return;

  // Miro-style: focus the clipboard trap whenever the canvas surface is clicked
  // so that the next Cmd+V fires a real paste event with clipboardData.files
  if (!event.target.matches("textarea, input, [contenteditable='true']:not([data-clipboard-trap])")) {
    focusClipboardTrap();
  }

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
        toSide: fromSide === "left" ? "right" : fromSide === "right" ? "left" : fromSide === "top" ? "bottom" : "top",
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
  if (IS_TLDRAW_PRIMARY_MODE) {
    return;
  }

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
      const fromNode = board.nodes.find((node) => node.id === draft.fromNodeId);
      const toNode = board.nodes.find((node) => node.id === targetNodeId);
      board.edges.push({
        id: `edge-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        from: draft.fromNodeId,
        to: targetNodeId,
        fromSide: draft.fromSide,
        toSide: resolveTargetSide(fromNode, toNode),
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
  if (IS_TLDRAW_PRIMARY_MODE) {
    return;
  }

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
  if (IS_TLDRAW_PRIMARY_MODE) {
    scheduleLocalPresenceSync({
      cursor: null,
    });
    return;
  }

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
    if (IS_TLDRAW_PRIMARY_MODE) {
      return;
    }

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

canvasViewport.addEventListener("dragenter", (event) => {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
  canvasViewport.classList.add("is-file-dragover");
});

canvasViewport.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  canvasViewport.classList.add("is-file-dragover");
  syncPointer(event.clientX, event.clientY, event.target);
});

canvasViewport.addEventListener("dragleave", (event) => {
  if (event.relatedTarget && canvasViewport.contains(event.relatedTarget)) return;
  canvasViewport.classList.remove("is-file-dragover");
});

canvasViewport.addEventListener("drop", async (event) => {
  const files = [...(event.dataTransfer?.files || [])];
  if (files.length === 0) return;

  event.preventDefault();
  canvasViewport.classList.remove("is-file-dragover");
  syncPointer(event.clientX, event.clientY, event.target);
  await handleCanvasFiles(files, {
    worldPoint: pointerToWorld(event.clientX, event.clientY),
  });
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

function isInlineEditorTarget(target) {
  return Boolean(target?.matches?.("[data-text-node], [data-link-field], [data-group-field], [data-file-field]"));
}

function handleInlineEditorFocusIn(event) {
  if (!isInlineEditorTarget(event.target)) return;
  state.editing.snapshot = createBoardSnapshot(getActiveBoard());
  state.editing.dirty = false;
  scheduleLocalPresenceSync({
    editing: currentEditingPresence(),
  });
}

function handleInlineEditorFocusOut(event) {
  if (!isInlineEditorTarget(event.target)) return;
  if (state.editing.snapshot && state.editing.dirty) {
    pushBoardHistory(getActiveBoard(), state.editing.snapshot);
    persistActiveBoard();
  }
  state.editing.snapshot = null;
  state.editing.dirty = false;
  scheduleLocalPresenceSync({
    editing: null,
  });
  // Re-focus clipboard trap so Cmd+V works immediately after leaving an editor
  requestAnimationFrame(() => focusClipboardTrap());
}

function handleInlineEditorInput(event) {
  if (!isInlineEditorTarget(event.target)) return;

  if (IS_TLDRAW_PRIMARY_MODE && event.currentTarget === workspaceCanvasApp) {
    state.editing.dirty = true;
    scheduleLocalPresenceSync({
      editing: currentEditingPresence(),
    });
    return;
  }

  const board = getActiveBoard();
  const nodeId = event.target.dataset.nodeId || event.target.dataset.textNode;
  const node = board.nodes.find((item) => item.id === nodeId);
  if (!node) return;

  if (event.target.matches("[data-text-node]")) {
    node.content = event.target.value;
    syncTextNodeAutoHeight(event.target, node);
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

  if (event.target.matches("[data-file-field='title']")) {
    node.title = event.target.value;
  }

  state.editing.dirty = true;
  scheduleLocalPresenceSync({
    editing: currentEditingPresence(),
  });
  persistActiveBoard();
}

for (const root of [canvasStage, workspaceCanvasApp]) {
  if (!root) continue;
  root.addEventListener("focusin", handleInlineEditorFocusIn);
  root.addEventListener("focusout", handleInlineEditorFocusOut);
  root.addEventListener("input", handleInlineEditorInput);
}

resetViewBtn?.addEventListener("click", () => {
  if (IS_TLDRAW_PRIMARY_MODE && window.__workspaceAppBridge?.resetView) {
    window.__workspaceAppBridge.resetView();
    return;
  }

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
  const isSpaceShortcut = event.code === "Space" || event.key === " " || event.key === "Spacebar";
  const isToolShortcut = event.code === "KeyC" || event.code === "KeyH" || event.code === "KeyV";

  if (IS_TLDRAW_PRIMARY_MODE) {
    if (isTypingTarget) {
      return;
    }

    // Space: open AI assistant with selected nodes as context (or hand tool if no selection)
    if (isSpaceShortcut) {
      event.preventDefault();
      if (!event.repeat) {
        const hasSelection = (window.__workspaceApp?.pageSelectedNodeIds?.length || 0) > 0
          || state.selection.nodeIds.length > 0;
        if (hasSelection) {
          openAssistantPanel({ focusInput: true });
        } else {
          beginTemporaryHandTool();
        }
      }
      return;
    }

    if (!event.metaKey && !event.ctrlKey && !event.altKey && window.__workspaceAppBridge?.setTool && isToolShortcut) {
      event.preventDefault();
      transientCanvasToolState.spaceHandActive = false;
      transientCanvasToolState.restoreToolId = "select";

      if (event.code === "KeyC") {
        window.__workspaceAppBridge.setTool("arrow");
        return;
      }

      if (event.code === "KeyH") {
        window.__workspaceAppBridge.setTool("hand");
        return;
      }

      if (event.code === "KeyV") {
        window.__workspaceAppBridge.setTool("select");
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const loweredKey = event.key.toLowerCase();

      if (loweredKey === "c") {
        event.preventDefault();
        void window.__workspaceAppBridge?.copySelectionToClipboard?.();
        return;
      }

      if (loweredKey === "x") {
        event.preventDefault();
        void window.__workspaceAppBridge?.cutSelectionToClipboard?.();
        return;
      }

      if (loweredKey === "v") {
        focusClipboardTrap();
        return;
      }
    }

    if (event.key === "Escape" && state.ui.isAssistantOpen) {
      closeAssistantPanel();
      return;
    }

    return;
  }

  // Compat mode: Space opens AI assistant with selected nodes as context
  if (isSpaceShortcut && shouldOpenAssistantFromSpace(event, target)) {
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
    // Don't preventDefault — let the native copy event fire.
    // Our capture-phase copy handler will set system clipboard data.
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") {
    // Don't preventDefault — let the native cut event fire.
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
    // Don't preventDefault — let the native paste event fire.
    // Our capture-phase paste handler will read clipboardData.files for images/PDFs.
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

window.addEventListener("keyup", (event) => {
  if (!IS_TLDRAW_PRIMARY_MODE) return;

  const isSpaceShortcut = event.code === "Space" || event.key === " " || event.key === "Spacebar";
  if (!isSpaceShortcut) return;

  event.preventDefault();
  endTemporaryHandTool();
});

window.addEventListener("blur", () => {
  endTemporaryHandTool();
});

window.addEventListener("workspace-app:board-change", (event) => {
  if (!IS_TLDRAW_PRIMARY_MODE) return;

  const nextBoard = event?.detail?.board;
  const board = getActiveBoard();
  if (!board || !nextBoard || nextBoard.key !== board.key) {
    return;
  }

  const currentPayload = createWorkspaceBridgePayload(board);
  if (JSON.stringify(currentPayload) === JSON.stringify(nextBoard)) {
    return;
  }

  board.camera = cloneValue(nextBoard.camera || board.camera);
  board.nodes = cloneValue(nextBoard.nodes || board.nodes);
  board.edges = cloneValue(nextBoard.edges || board.edges);
  persistActiveBoard();
  window.__workspaceBoardState = createWorkspaceBridgePayload(board);
  suppressNextWorkspaceAppSync = true;
  renderCanvas();
});

window.addEventListener("workspace-app:selection-change", (event) => {
  if (!IS_TLDRAW_PRIMARY_MODE) return;

  const nodeIds = uniqueIds(Array.isArray(event?.detail?.nodeIds) ? event.detail.nodeIds : []);
  const edgeIds = uniqueIds(Array.isArray(event?.detail?.edgeIds) ? event.detail.edgeIds : []);
  const nextSelectedEdgeId = edgeIds[0] || null;

  if (
    JSON.stringify(nodeIds) === JSON.stringify(state.selection.nodeIds) &&
    nextSelectedEdgeId === state.ui.selectedEdgeId
  ) {
    window.__workspaceApp = {
      ...(window.__workspaceApp || {}),
      pageSelectedNodeIds: nodeIds,
      pageSelectedEdgeIds: edgeIds,
    };
    return;
  }

  state.selection.nodeIds = nodeIds;
  state.ui.selectedEdgeId = nextSelectedEdgeId;
  scheduleLocalPresenceSync({
    selection: {
      nodeIds,
    },
  });
  window.__workspaceApp = {
    ...(window.__workspaceApp || {}),
    pageSelectedNodeIds: nodeIds,
    pageSelectedEdgeIds: edgeIds,
  };

  if (state.ui.isAssistantOpen) {
    renderAssistantThread();
  }
});

window.addEventListener("workspace-app:state-change", (event) => {
  const toolId = event?.detail?.currentToolId || "select";
  updateCanvasToolbarToolState(toolId);

  if (IS_TLDRAW_PRIMARY_MODE && toolId !== "select") {
    collapseCanvasContext();
  }
});

window.addEventListener("workspace-app:file-paste", async (event) => {
  const files = Array.isArray(event?.detail?.files) ? event.detail.files.filter(Boolean) : [];
  if (files.length === 0) return;

  await handleCanvasFiles(files, {
    worldPoint: getCanvasViewportCenterWorldPoint(),
  });
});

// ── Universal file-paste handler (both modes) ──────────────────────────────
// Miro-style: ALWAYS intercept the native paste event to check for file data
// from macOS Finder. This runs in CAPTURE phase before tldraw's own handler.
// For files, we handle them ourselves. For everything else, we either handle
// it (compat mode) or let tldraw handle it (tldraw mode).
document.addEventListener("paste", (event) => {
  const target = document.activeElement;
  // Skip real editable fields but NOT the clipboard trap
  if (target?.matches?.("textarea, input, [contenteditable='true']:not([data-clipboard-trap])")) return;

  const clipboardData = event.clipboardData;
  if (!clipboardData) return;

  // ── STEP 1: Check for file data (works in BOTH modes) ──
  // macOS Finder puts image data as image/tiff in clipboardData.items (not .files).
  // Like Miro, we check items first for file kind, then clipboardData.files as fallback.
  const collectedFiles = [];

  // 1a. Check clipboardData.items — Finder images appear here as kind='file'
  if (clipboardData.items && clipboardData.items.length > 0) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file && file.size > 0) {
          // Assign a name if the file has no name (macOS clipboard files often lack names)
          if (!file.name || file.name === "image.tiff") {
            const ext = (file.type || "").split("/")[1] || "bin";
            const renamedFile = new File([file], `paste-${Date.now()}-${i}.${ext}`, { type: file.type });
            collectedFiles.push(renamedFile);
          } else {
            collectedFiles.push(file);
          }
        }
      }
    }
  }

  // 1b. Fallback: check clipboardData.files (drag-and-drop, screenshots)
  if (collectedFiles.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const file = clipboardData.files[i];
      if (file && file.size > 0) {
        collectedFiles.push(file);
      }
    }
  }

  if (collectedFiles.length > 0) {
    event.preventDefault();
    event.stopImmediatePropagation();

    // Convert TIFF files to PNG (browsers can receive tiff from macOS but can't display them)
    const processedFilesPromise = Promise.all(
      collectedFiles.map((file) => {
        if (file.type === "image/tiff" || file.type === "image/x-tiff") {
          return convertImageFileToPng(file);
        }
        return Promise.resolve(file);
      })
    );

    processedFilesPromise.then((processedFiles) => {
      const validFiles = processedFiles.filter(Boolean);
      if (validFiles.length > 0) {
        const center = getCanvasViewportCenterWorldPoint();
        handleCanvasFiles(validFiles, {
          worldPoint: center,
        });
      }
    }).catch((err) => {
      console.error("Failed to process pasted files:", err);
    });

    return;
  }

  // ── STEP 2: Non-file paste ──
  // In tldraw mode, let tldraw handle text/node paste via its own handler
  if (IS_TLDRAW_PRIMARY_MODE) {
    // Delegate to tldraw's paste handler for non-file clipboard content
    void window.__workspaceAppBridge?.pasteFromClipboard?.();
    return;
  }

  // In compat mode, handle workspace clipboard and text paste ourselves
  const html = clipboardData.getData("text/html");
  const zmPayload = parseZmWorkspaceClipboardFromHtml(html);
  if (zmPayload) {
    event.preventDefault();
    event.stopImmediatePropagation();
    state.selection.clipboard = {
      nodes: cloneValue(zmPayload.nodes),
      edges: cloneValue(zmPayload.edges || []),
    };
    pasteSelection();
    return;
  }

  // Handle text paste
  const pastedText =
    normalizeClipboardTextCompat(clipboardData.getData("text/plain")) ||
    normalizeClipboardTextCompat(
      new DOMParser().parseFromString(html || "", "text/html").body.textContent || ""
    );
  if (pastedText) {
    event.preventDefault();
    event.stopImmediatePropagation();
    pasteExternalTextCompat(pastedText);
  }
}, true); // <-- CAPTURE PHASE

// Native copy/cut event listeners for compat (legacy) mode.
if (!IS_TLDRAW_PRIMARY_MODE) {
  document.addEventListener("copy", (event) => {
    const target = document.activeElement;
    if (target?.matches?.("textarea, input, [contenteditable='true']:not([data-clipboard-trap])")) return;

    const board = getActiveBoard();
    const selectedNodes = getSelectedNodes(board);
    if (selectedNodes.length === 0) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    // Update internal clipboard
    const selectedIds = new Set(selectedNodes.map((node) => node.id));
    state.selection.clipboard = {
      nodes: cloneValue(selectedNodes),
      edges: cloneValue(board.edges.filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))),
    };

    // Write to system clipboard
    const textParts = selectedNodes.map((node) => {
      if (node.type === "link") return [node.title || "Reference link", node.url || node.content || ""].filter(Boolean).join("\n");
      if (node.type === "group") return node.label || "Cluster";
      if (node.type === "file") return [node.title || "Attachment", node.file || node.content || ""].filter(Boolean).join("\n");
      if (node.type === "project") return [node.title || "", node.desc || node.content || ""].filter(Boolean).join("\n");
      return node.content || node.title || "";
    });
    const plainText = textParts.join("\n\n").trim() || " ";
    const clipboardPayload = JSON.stringify({
      __zmWorkspaceClipboard: true,
      nodes: cloneValue(selectedNodes),
      edges: cloneValue(board.edges.filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))),
    });
    const htmlContent = `<div data-zm-workspace-clipboard="${encodeURIComponent(clipboardPayload)}"><pre>${escapeHtml(plainText)}</pre></div>`;

    event.clipboardData.setData("text/plain", plainText);
    event.clipboardData.setData("text/html", htmlContent);
  }, true); // <-- CAPTURE PHASE

  document.addEventListener("cut", (event) => {
    const target = document.activeElement;
    if (target?.matches?.("textarea, input, [contenteditable='true']:not([data-clipboard-trap])")) return;

    const board = getActiveBoard();
    const selectedNodes = getSelectedNodes(board);
    if (selectedNodes.length === 0 && !state.ui.selectedEdgeId) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    // Update internal clipboard
    const selectedIds = new Set(selectedNodes.map((node) => node.id));
    state.selection.clipboard = {
      nodes: cloneValue(selectedNodes),
      edges: cloneValue(board.edges.filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))),
    };

    // Write to system clipboard
    const textParts = selectedNodes.map((node) => {
      if (node.type === "link") return [node.title || "Reference link", node.url || node.content || ""].filter(Boolean).join("\n");
      if (node.type === "group") return node.label || "Cluster";
      if (node.type === "file") return [node.title || "Attachment", node.file || node.content || ""].filter(Boolean).join("\n");
      if (node.type === "project") return [node.title || "", node.desc || node.content || ""].filter(Boolean).join("\n");
      return node.content || node.title || "";
    });
    const plainText = textParts.join("\n\n").trim() || " ";
    const clipboardPayload = JSON.stringify({
      __zmWorkspaceClipboard: true,
      nodes: cloneValue(selectedNodes),
      edges: cloneValue(board.edges.filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))),
    });
    const htmlContent = `<div data-zm-workspace-clipboard="${encodeURIComponent(clipboardPayload)}"><pre>${escapeHtml(plainText)}</pre></div>`;

    event.clipboardData.setData("text/plain", plainText);
    event.clipboardData.setData("text/html", htmlContent);

    removeSelection();
  }, true); // <-- CAPTURE PHASE
}

window.addEventListener("beforeunload", () => {
  destroyActiveCollaborationSession("idle");
});

mountWorkspaceEngine().catch((error) => {
  window.__workspaceApp = {
    engine: "tldraw",
    ready: false,
    status: "error",
    error: error instanceof Error ? error.message : "Unable to mount Workspace app.",
    currentToolId: "select",
    pageSelectedNodeIds: window.__workspaceApp?.pageSelectedNodeIds || [],
    pageSelectedEdgeIds: window.__workspaceApp?.pageSelectedEdgeIds || [],
  };
  updateCanvasToolbarToolState("select");
  console.error(error instanceof Error ? error.message : "Unable to mount Workspace app.");
});

applyInitialRoute();
syncRoute();
renderAssistantThread();
renderCollaborationStatus();
renderCanvas();
syncBoardFromCloud(getActiveBoard());
updateCanvasToolbarToolState();
// Miro-style: ensure clipboard trap has focus on initial load
requestAnimationFrame(() => focusClipboardTrap());
