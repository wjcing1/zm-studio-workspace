import { studioData } from "../../studio-data.mjs";

export const pageLinks = {
  workspace: "./workspace.html",
  projects: "./projects.html",
  assets: "./assets.html",
};

export const projectDatabase = studioData.projects;
export const assetsDatabase = studioData.assets;
export const projectIndex = new Map(projectDatabase.map((project) => [project.id, project]));
export const filters = ["All", ...new Set(assetsDatabase.map((asset) => asset.category))];
export const STORAGE_PREFIX = "zm-studio-canvas";

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

function createBoard(boardKey, source, project = null) {
  const baseCamera = sanitizeCamera(source?.camera, defaultViewportCamera());
  const persistedRaw = readStorage(boardStorageKey(boardKey));
  let persisted = null;

  if (persistedRaw) {
    try {
      persisted = JSON.parse(persistedRaw);
    } catch {
      persisted = null;
    }
  }

  return {
    key: boardKey,
    projectId: project?.id || null,
    title: source?.title || (project ? `${project.name} Canvas` : "Studio Canvas"),
    description: source?.description || project?.summary || studioData.studio.description,
    defaultCamera: cloneValue(baseCamera),
    camera: sanitizeCamera(persisted?.camera, baseCamera),
    nodes: sanitizeNodes(persisted?.nodes ?? source?.nodes ?? []),
    connections: cloneValue(source?.connections ?? []),
  };
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

  writeStorage(
    boardStorageKey(board.key),
    JSON.stringify({
      camera: board.camera,
      nodes: board.nodes,
    }),
  );
}

export { studioData };
