import {
  clamp,
  cloneValue,
  createBoardRegistry,
  escapeHtml,
  getProject,
  icon,
  persistBoard,
  projectDatabase,
  studioData,
} from "./shared/studio-data-client.js";
import { setupWebApp } from "./shared/register-web-app.js";

setupWebApp();

const state = {
  boards: createBoardRegistry(),
  canvasContext: {
    mode: "overview",
    projectId: null,
  },
  interaction: {
    mode: null,
    nodeId: null,
    lastX: 0,
    lastY: 0,
  },
};

const canvasViewport = document.getElementById("canvasViewport");
const canvasGrid = document.getElementById("canvasGrid");
const canvasConnections = document.getElementById("canvasConnections");
const canvasStage = document.getElementById("canvasStage");
const canvasBreadcrumb = document.getElementById("canvasBreadcrumb");
const canvasContextKicker = document.getElementById("canvasContextKicker");
const canvasContextTitle = document.getElementById("canvasContextTitle");
const canvasContextCopy = document.getElementById("canvasContextCopy");
const canvasContextMeta = document.getElementById("canvasContextMeta");
const canvasBackBtn = document.getElementById("canvasBackBtn");
const zoomValue = document.querySelector("#zoomValue span");
const resetViewBtn = document.getElementById("resetViewBtn");

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

function ensureProjectBoard(projectId) {
  return state.boards[projectId] || null;
}

function estimateNodeHeight(node) {
  if (typeof node.h === "number") return node.h;
  if (node.type === "image") return 240;
  if (node.type === "project") return 250;

  const content = String(node.content || "");
  const lineCount = content.split("\n").length;
  return Math.max(170, 100 + lineCount * 22);
}

function getNodeFrame(node) {
  const height = estimateNodeHeight(node);
  return {
    x: node.x,
    y: node.y,
    width: node.w,
    height,
  };
}

function computeBoardBounds(nodes) {
  let width = 1600;
  let height = 1100;

  for (const node of nodes) {
    const frame = getNodeFrame(node);
    width = Math.max(width, frame.x + frame.width + 220);
    height = Math.max(height, frame.y + frame.height + 220);
  }

  return { width, height };
}

function buildConnectionPath(fromNode, toNode) {
  const fromFrame = getNodeFrame(fromNode);
  const toFrame = getNodeFrame(toNode);
  const startX = fromFrame.x + fromFrame.width;
  const startY = fromFrame.y + fromFrame.height / 2;
  const endX = toFrame.x;
  const endY = toFrame.y + toFrame.height / 2;
  const curve = Math.max(90, Math.abs(endX - startX) * 0.35);

  return `M ${startX} ${startY} C ${startX + curve} ${startY} ${endX - curve} ${endY} ${endX} ${endY}`;
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

function renderCanvasContext(board) {
  const activeProject = state.canvasContext.mode === "project" ? getProject(state.canvasContext.projectId) : null;

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
  canvasConnections.innerHTML = board.connections
    .map((connection) => {
      const fromNode = nodesById.get(connection.from);
      const toNode = nodesById.get(connection.to);
      if (!fromNode || !toNode) return "";

      return `<path d="${buildConnectionPath(fromNode, toNode)}"></path>`;
    })
    .join("");

  canvasStage.innerHTML = board.nodes
    .map((node) => {
      const height = node.h === "auto" ? "auto" : `${node.h}px`;
      const style = `left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${height};`;
      const className = [
        "canvas-node",
        node.type === "image" ? "image-node" : "card",
        state.interaction.nodeId === node.id ? "is-dragging" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const contextMode = escapeHtml(state.canvasContext.mode);

      if (node.type === "text") {
        return `
          <div class="${className}" data-id="${node.id}" data-node-type="${node.type}" data-project-context="${contextMode}" style="${style}">
            <div class="drag-handle"></div>
            <textarea class="canvas-textarea" data-text-node="${node.id}" spellcheck="false">${escapeHtml(node.content || "")}</textarea>
          </div>
        `;
      }

      if (node.type === "project") {
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
          </div>
        `;
      }

      return `
        <div class="${className}" data-id="${node.id}" data-node-type="${node.type}" data-project-context="${contextMode}" style="${style}">
          <img src="${escapeHtml(node.content || "")}" alt="canvas media" draggable="false" />
        </div>
      `;
    })
    .join("");
}

function openOverviewCanvas() {
  state.canvasContext = {
    mode: "overview",
    projectId: null,
  };
  syncRoute();
  renderCanvas();
}

function openProjectCanvas(projectId) {
  const board = ensureProjectBoard(projectId);
  if (!board) return;

  state.canvasContext = {
    mode: "project",
    projectId,
  };
  syncRoute();
  renderCanvas();
}

function bringNodeToFront(nodeId) {
  const board = getActiveBoard();
  if (!board) return;

  const target = board.nodes.find((node) => node.id === nodeId);
  if (!target) return;

  board.nodes = board.nodes.filter((node) => node.id !== nodeId);
  board.nodes.push(target);
  persistActiveBoard();
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

function endCanvasInteraction() {
  if (!state.interaction.mode) return;

  state.interaction.mode = null;
  state.interaction.nodeId = null;
  canvasViewport.classList.remove("is-panning");
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

canvasBackBtn?.addEventListener("click", () => {
  openOverviewCanvas();
});

canvasViewport.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".canvas-context-shell")) return;
  if (event.target.closest("[data-open-project]")) return;

  const nodeElement = event.target.closest(".canvas-node");
  const isTextarea = event.target.matches("textarea");

  if (nodeElement && !isTextarea) {
    const nodeId = nodeElement.dataset.id;
    bringNodeToFront(nodeId);
    state.interaction.mode = "drag";
    state.interaction.nodeId = nodeId;
    state.interaction.lastX = event.clientX;
    state.interaction.lastY = event.clientY;
    renderCanvas();
    canvasViewport.setPointerCapture(event.pointerId);
    return;
  }

  if (!nodeElement) {
    state.interaction.mode = "pan";
    state.interaction.nodeId = null;
    state.interaction.lastX = event.clientX;
    state.interaction.lastY = event.clientY;
    canvasViewport.classList.add("is-panning");
    canvasViewport.setPointerCapture(event.pointerId);
  }
});

canvasViewport.addEventListener("pointermove", (event) => {
  if (!state.interaction.mode) return;

  const board = getActiveBoard();
  const dx = event.clientX - state.interaction.lastX;
  const dy = event.clientY - state.interaction.lastY;

  if (state.interaction.mode === "pan") {
    board.camera.x += dx;
    board.camera.y += dy;
  }

  if (state.interaction.mode === "drag") {
    const node = board.nodes.find((item) => item.id === state.interaction.nodeId);
    if (node) {
      node.x += dx / board.camera.z;
      node.y += dy / board.camera.z;
    }
  }

  state.interaction.lastX = event.clientX;
  state.interaction.lastY = event.clientY;
  renderCanvas();
});

canvasViewport.addEventListener("pointerup", endCanvasInteraction);
canvasViewport.addEventListener("pointercancel", endCanvasInteraction);
canvasViewport.addEventListener("pointerleave", () => {
  if (state.interaction.mode === "pan") endCanvasInteraction();
});

canvasViewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();

    const board = getActiveBoard();
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

  const board = getActiveBoard();
  const world = pointerToWorld(event.clientX, event.clientY);
  board.nodes.push({
    id: `node-${Date.now()}`,
    type: "text",
    x: world.x,
    y: world.y,
    w: 250,
    h: "auto",
    content: "Start typing...",
  });
  persistActiveBoard();
  renderCanvas();
});

canvasStage.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-project]");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  openProjectCanvas(button.dataset.openProject || "");
});

canvasStage.addEventListener("input", (event) => {
  if (!event.target.matches("[data-text-node]")) return;

  const board = getActiveBoard();
  const nodeId = event.target.dataset.textNode;
  const node = board.nodes.find((item) => item.id === nodeId);
  if (node) {
    node.content = event.target.value;
    persistActiveBoard();
  }
});

resetViewBtn?.addEventListener("click", () => {
  const board = getActiveBoard();
  board.camera = cloneValue(board.defaultCamera);
  persistActiveBoard();
  renderCanvas();
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

applyInitialRoute();
syncRoute();
renderCanvas();
