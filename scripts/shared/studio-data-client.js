import {
  applyBoardSnapshot,
  createBoardSnapshot,
  createBoardState,
} from "./workspace-board.js";

export const pageLinks = {
  workspace: "./workspace.html",
  projects: "./projects.html",
  assets: "./assets.html",
};

const STATIC_STUDIO_DATA_PATH = "./data/studio-data.json";

async function readStudioDataResponse(response) {
  let payload = null;

  try {
    payload = await response.json();
  } catch {}

  if (!response.ok || !payload || !Array.isArray(payload.projects) || !Array.isArray(payload.assets)) {
    throw new Error(`Unable to load studio data from ${response.url || "runtime source"}.`);
  }

  return payload;
}

async function fetchStudioDataSnapshot() {
  try {
    const runtimeResponse = await fetch("/api/studio-data", {
      headers: {
        accept: "application/json",
      },
    });
    return await readStudioDataResponse(runtimeResponse);
  } catch {}

  const staticResponse = await fetch(STATIC_STUDIO_DATA_PATH, {
    headers: {
      accept: "application/json",
    },
  });
  return readStudioDataResponse(staticResponse);
}

async function loadStudioDataInternal() {
  const payload = await fetchStudioDataSnapshot();

  return {
    meta: payload?.meta || {},
    studio: payload?.studio || {
      name: "",
      base: "",
      description: "",
      focus: [],
    },
    assistant: payload?.assistant || {
      greeting: "",
      starters: [],
    },
    canvas: payload?.canvas || {
      overview: null,
    },
    projects: Array.isArray(payload?.projects) ? payload.projects : [],
    assets: Array.isArray(payload?.assets) ? payload.assets : [],
  };
}

export const studioData = await loadStudioDataInternal();
export const projectDatabase = studioData.projects;
export const assetsDatabase = studioData.assets;
export const projectIndex = new Map(projectDatabase.map((project) => [project.id, project]));
export const filters = ["All", ...new Set(assetsDatabase.map((asset) => asset.category))];
export const STORAGE_PREFIX = "zm-studio-canvas";
const REMOTE_SAVE_DELAY_MS = 220;
const DEFAULT_COLLABORATION_CONFIG = {
  mode: "local",
  provider: "local-storage",
  features: {
    persistence: false,
    realtime: false,
    presence: false,
    localCache: true,
  },
  endpoints: {
    config: "/api/collaboration/config",
    boards: "/api/boards/:boardId",
    uploads: "/api/uploads",
    realtime: "/api/collaboration/ws",
  },
};

let collaborationConfigPromise = null;
const hydrationPromises = new Map();
const pendingBoardSaves = new Map();
const realtimeBoardSaves = new Map();

export async function loadStudioData() {
  return studioData;
}

export function defaultViewportCamera() {
  return {
    x: Math.max(window.innerWidth * 0.08, 90),
    y: Math.max(window.innerHeight * 0.06, 80),
    z: 1,
  };
}

export function cloneValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function nl2br(value) {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

export function statusClass(status) {
  if (status === "Completed") return "is-complete";
  if (status === "On Hold") return "is-hold";
  return "is-progress";
}

export function icon(name) {
  const icons = {
    link: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L10 5"></path><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L14 19"></path></svg>',
    progress: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke-dasharray="3 3"></circle></svg>',
    done: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 12 2 2 4-5"></path><circle cx="12" cy="12" r="9"></circle></svg>',
    pause: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M10 9v6"></path><path d="M14 9v6"></path></svg>',
    box: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 7v10l-7 4-7-4V7Z"></path><path d="M12 12 19 7"></path><path d="M12 12 5 7"></path><path d="M12 12v9"></path></svg>',
    image: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="1.2"></circle><path d="m21 16-5.5-5.5L7 19"></path></svg>',
    download: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M4 21h16"></path></svg>',
    search: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>',
    spark: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 14.5 9.5 21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"></path></svg>',
    send: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11.5 17-8.5-3.5 17-4.5-6-6 2.5Z"></path></svg>',
    arrow: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"></path><path d="M9 7h8v8"></path></svg>',
  };
  return icons[name] || "";
}

export function getProject(projectId) {
  return projectIndex.get(projectId) || null;
}

export function buildWorkspaceLink(projectId = "") {
  if (!projectId) {
    return pageLinks.workspace;
  }

  return `${pageLinks.workspace}?project=${encodeURIComponent(projectId)}`;
}

function sanitizeCamera(value, fallback) {
  return {
    x: typeof value?.x === "number" ? value.x : fallback.x,
    y: typeof value?.y === "number" ? value.y : fallback.y,
    z: clamp(typeof value?.z === "number" ? value.z : fallback.z, 0.35, 3),
  };
}

function sanitizeNodes(nodes) {
  if (!Array.isArray(nodes)) return [];

  return cloneValue(nodes).map((node) => ({
    ...node,
    x: typeof node.x === "number" ? node.x : 0,
    y: typeof node.y === "number" ? node.y : 0,
    w: typeof node.w === "number" ? node.w : 320,
    h: node.h === undefined ? "auto" : node.h,
  }));
}

function buildFallbackProjectBoard(project) {
  return {
    title: `${project.name} Canvas`,
    description: project.summary,
    camera: { x: 112, y: 92, z: 0.9 },
    nodes: [
      {
        id: "hero",
        type: "project",
        x: 160,
        y: 150,
        w: 420,
        h: "auto",
        title: project.name,
        desc: project.summary,
        tags: project.deliverables.slice(0, 3),
      },
      {
        id: "deliverables",
        type: "text",
        x: 700,
        y: 160,
        w: 320,
        h: "auto",
        content: `Deliverables\n\n- ${project.deliverables.join("\n- ")}`,
      },
      {
        id: "details",
        type: "text",
        x: 180,
        y: 470,
        w: 340,
        h: "auto",
        content: `Project Details\n\nLocation: ${project.location}\nYear: ${project.year}\nStatus: ${project.status}`,
      },
    ],
    connections: [
      { from: "hero", to: "deliverables" },
      { from: "hero", to: "details" },
    ],
  };
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function boardStorageKey(boardKey) {
  return `${STORAGE_PREFIX}:${boardKey}`;
}

function createRemoteBoardPayload(board) {
  const snapshot = createBoardSnapshot(board);

  return {
    key: board.key,
    projectId: board.projectId || null,
    title: board.title || "",
    description: board.description || "",
    camera: snapshot.camera,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
  };
}

function applyRemoteBoard(board, remoteBoard) {
  if (!board || !remoteBoard) return;

  board.title = typeof remoteBoard.title === "string" ? remoteBoard.title : board.title;
  board.description = typeof remoteBoard.description === "string" ? remoteBoard.description : board.description;
  board.projectId = remoteBoard.projectId || board.projectId || null;
  applyBoardSnapshot(board, {
    camera: remoteBoard.camera,
    nodes: remoteBoard.nodes,
    edges: remoteBoard.edges,
  });
  board.collaboration = {
    ...(board.collaboration || {}),
    hydrated: true,
    lastSyncedAt: Date.now(),
  };
}

function getBoardLocalRevision(board) {
  return typeof board?.localRevision === "number" && Number.isFinite(board.localRevision) ? board.localRevision : 0;
}

function boardEndpoint(config, boardKey) {
  const pattern = config?.endpoints?.boards || DEFAULT_COLLABORATION_CONFIG.endpoints.boards;
  return pattern.replace(":boardId", encodeURIComponent(boardKey));
}

async function readJsonResponse(response, fallbackMessage) {
  let payload = null;

  try {
    payload = await response.json();
  } catch {}

  if (!response.ok) {
    const errorMessage = payload?.error || fallbackMessage || `Request failed with ${response.status}`;
    throw new Error(errorMessage);
  }

  return payload;
}

export async function getCollaborationConfig() {
  if (!collaborationConfigPromise) {
    collaborationConfigPromise = (async () => {
      try {
        const response = await fetch(DEFAULT_COLLABORATION_CONFIG.endpoints.config, {
          headers: {
            accept: "application/json",
          },
        });
        const payload = await readJsonResponse(response, "Unable to load collaboration config.");

        return {
          ...DEFAULT_COLLABORATION_CONFIG,
          ...payload,
          features: {
            ...DEFAULT_COLLABORATION_CONFIG.features,
            ...(payload?.features || {}),
          },
          endpoints: {
            ...DEFAULT_COLLABORATION_CONFIG.endpoints,
            ...(payload?.endpoints || {}),
          },
        };
      } catch {
        return cloneValue(DEFAULT_COLLABORATION_CONFIG);
      }
    })();
  }

  return collaborationConfigPromise;
}

export function registerRealtimeBoardSync(boardKey, handler) {
  if (!boardKey) return;

  const pending = pendingBoardSaves.get(boardKey);
  if (pending?.timer) {
    window.clearTimeout(pending.timer);
  }
  pendingBoardSaves.delete(boardKey);

  if (typeof handler === "function") {
    realtimeBoardSaves.set(boardKey, handler);
    return;
  }

  realtimeBoardSaves.delete(boardKey);
}

export async function hydrateBoardFromCloud(board) {
  if (!board?.key || hydrationPromises.has(board.key)) {
    return hydrationPromises.get(board?.key) || null;
  }

  const task = (async () => {
    const config = await getCollaborationConfig();
    const startedRevision = getBoardLocalRevision(board);

    if (!config.features?.persistence || config.mode !== "server") {
      return null;
    }

    const response = await fetch(boardEndpoint(config, board.key), {
      headers: {
        accept: "application/json",
      },
    });
    const payload = await readJsonResponse(response, `Unable to load board ${board.key}.`);

    if (payload?.board) {
      // If the board changed locally while the hydration request was in flight,
      // keep the newer local state and let the pending save push it upstream.
      if (getBoardLocalRevision(board) === startedRevision) {
        applyRemoteBoard(board, payload.board);
        writeStorage(boardStorageKey(board.key), JSON.stringify(createBoardSnapshot(board)));
      }
    }

    return payload;
  })()
    .catch(() => null)
    .finally(() => {
      hydrationPromises.delete(board.key);
    });

  hydrationPromises.set(board.key, task);
  return task;
}

async function flushBoardSave(boardKey) {
  const pending = pendingBoardSaves.get(boardKey);
  if (!pending) return;

  pendingBoardSaves.delete(boardKey);

  const config = await getCollaborationConfig();
  if (!config.features?.persistence || config.mode !== "server") {
    return;
  }

  try {
    const response = await fetch(boardEndpoint(config, boardKey), {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        board: pending.payload,
      }),
    });
    const payload = await readJsonResponse(response, `Unable to save board ${boardKey}.`);

    if (payload?.board && pending.board?.key === boardKey) {
      // Skip stale save responses if newer local edits landed after this request was queued.
      if (getBoardLocalRevision(pending.board) === pending.revision) {
        applyRemoteBoard(pending.board, payload.board);
        writeStorage(boardStorageKey(boardKey), JSON.stringify(createBoardSnapshot(pending.board)));
      }
    }
  } catch (error) {
    console.warn(error instanceof Error ? error.message : `Unable to save board ${boardKey}.`);
  }
}

function createBoard(boardKey, source, project = null) {
  const persistedRaw = readStorage(boardStorageKey(boardKey));
  let persisted = null;

  if (persistedRaw) {
    try {
      persisted = JSON.parse(persistedRaw);
    } catch {
      persisted = null;
    }
  }

  return createBoardState({
    boardKey,
    source,
    persisted,
    projectId: project?.id || null,
    title: source?.title || (project ? `${project.name} Canvas` : "Studio Canvas"),
    description: source?.description || project?.summary || studioData.studio.description,
    fallbackCamera: sanitizeCamera(source?.camera, defaultViewportCamera()),
  });
}

export function createBoardRegistry() {
  const boards = {
    overview: createBoard("overview", studioData.canvas?.overview || {}, null),
  };

  for (const project of projectDatabase) {
    boards[project.id] = createBoard(project.id, project.canvas || buildFallbackProjectBoard(project), project);
  }

  return boards;
}

export function persistBoard(board) {
  if (!board) return;

  board.localRevision = getBoardLocalRevision(board) + 1;

  writeStorage(boardStorageKey(board.key), JSON.stringify(createBoardSnapshot(board)));

  const realtimeSync = realtimeBoardSaves.get(board.key);
  if (typeof realtimeSync === "function") {
    realtimeSync(board);
    return;
  }

  const pending = pendingBoardSaves.get(board.key);
  if (pending?.timer) {
    window.clearTimeout(pending.timer);
  }

  pendingBoardSaves.set(board.key, {
    board,
    revision: board.localRevision,
    payload: createRemoteBoardPayload(board),
    timer: window.setTimeout(() => {
      flushBoardSave(board.key);
    }, REMOTE_SAVE_DELAY_MS),
  });
}
