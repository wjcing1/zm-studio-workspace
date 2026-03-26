import { studioData } from "./studio-data.mjs";

const projectDatabase = studioData.projects;
const assetsDatabase = studioData.assets;
const projectIndex = new Map(projectDatabase.map((project) => [project.id, project]));
const filters = ["All", ...new Set(assetsDatabase.map((asset) => asset.category))];
const STORAGE_PREFIX = "zm-studio-canvas";

function defaultViewportCamera() {
  return {
    x: Math.max(window.innerWidth * 0.08, 90),
    y: Math.max(window.innerHeight * 0.06, 80),
    z: 1,
  };
}

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nl2br(value) {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function statusClass(status) {
  if (status === "Completed") return "is-complete";
  if (status === "On Hold") return "is-hold";
  return "is-progress";
}

function icon(name) {
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

function createBoardRegistry() {
  const boards = {
    overview: createBoard("overview", studioData.canvas?.overview || {}, null),
  };

  for (const project of projectDatabase) {
    boards[project.id] = createBoard(project.id, project.canvas || buildFallbackProjectBoard(project), project);
  }

  return boards;
}

const state = {
  currentView: "canvas",
  canvasContext: {
    mode: "overview",
    projectId: null,
  },
  boards: createBoardRegistry(),
  activeFilter: "All",
  searchQuery: "",
  interaction: {
    mode: null,
    nodeId: null,
    lastX: 0,
    lastY: 0,
  },
  chat: {
    messages: [
      {
        role: "assistant",
        content: studioData.assistant.greeting,
      },
    ],
    input: "",
    sending: false,
    error: "",
  },
};

const views = {
  canvas: document.getElementById("canvas-view"),
  projects: document.getElementById("projects-view"),
  assets: document.getElementById("assets-view"),
};

const brandButton = document.querySelector(".brand");
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
const projectRows = document.getElementById("projectRows");
const projectStatus = document.getElementById("projectStatus");
const assetGrid = document.getElementById("assetGrid");
const assetFilters = document.getElementById("assetFilters");
const assetSearch = document.getElementById("assetSearch");
const resetViewBtn = document.getElementById("resetViewBtn");
const assistantMessages = document.getElementById("assistantMessages");
const assistantStarters = document.getElementById("assistantStarters");
const assistantStatus = document.getElementById("assistantStatus");
const assistantInput = document.getElementById("assistantInput");
const assistantSend = document.getElementById("assistantSend");
const assistantComposer = document.getElementById("assistantComposer");

function getActiveBoardKey() {
  return state.canvasContext.mode === "project" && state.canvasContext.projectId
    ? state.canvasContext.projectId
    : "overview";
}

function getActiveBoard() {
  return state.boards[getActiveBoardKey()];
}

function getProject(projectId) {
  return projectIndex.get(projectId) || null;
}

function persistBoard(boardKey) {
  const board = state.boards[boardKey];
  if (!board) return;

  writeStorage(
    boardStorageKey(boardKey),
    JSON.stringify({
      camera: board.camera,
      nodes: board.nodes,
    }),
  );
}

function persistActiveBoard() {
  persistBoard(getActiveBoardKey());
}

function ensureProjectBoard(projectId) {
  if (state.boards[projectId]) return state.boards[projectId];

  const project = getProject(projectId);
  if (!project) return null;

  state.boards[projectId] = createBoard(project.id, buildFallbackProjectBoard(project), project);
  return state.boards[projectId];
}

function openOverviewCanvas() {
  state.canvasContext = {
    mode: "overview",
    projectId: null,
  };
  switchView("canvas");
  renderCanvas();
  renderProjects();
}

function openProjectCanvas(projectId) {
  const board = ensureProjectBoard(projectId);
  if (!board) return;

  state.canvasContext = {
    mode: "project",
    projectId,
  };
  switchView("canvas");
  renderCanvas();
  renderProjects();
}

function switchView(nextView) {
  state.currentView = nextView;

  Object.entries(views).forEach(([name, element]) => {
    element.classList.toggle("is-active", name === nextView);
  });

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewTarget === nextView);
  });
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
    `<span class="meta-chip"><span class="meta-chip-label">Assets</span>${escapeHtml(String(assetsDatabase.length))}</span>`,
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
              <p class="project-copy">${nl2br(node.desc || "")}</p>
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

function renderProjects() {
  projectStatus.textContent = `System Online • ${projectDatabase.length} Records • Click a row to open its canvas`;

  projectRows.innerHTML = projectDatabase
    .map((project) => {
      const statusIcon =
        project.status === "Completed"
          ? icon("done")
          : project.status === "On Hold"
            ? icon("pause")
            : icon("progress");
      const isActive =
        state.canvasContext.mode === "project" && state.canvasContext.projectId === project.id;

      return `
        <div
          class="grid-row ${isActive ? "is-active" : ""}"
          data-project-id="${escapeHtml(project.id)}"
          tabindex="0"
          role="button"
          aria-label="Open ${escapeHtml(project.name)} canvas"
        >
          <div class="mono">
            ${escapeHtml(project.id)}
            <span class="project-open-label">Canvas</span>
          </div>
          <div>
            <span class="project-name">${escapeHtml(project.name)}</span>
            <span class="project-client">${escapeHtml(project.client)}</span>
          </div>
          <div>
            <span class="status-pill ${statusClass(project.status)}">
              ${statusIcon}
              ${escapeHtml(project.status)}
            </span>
          </div>
          <div class="budget">${escapeHtml(project.budget)}</div>
          <div class="team-stack">
            <div class="lead-badge">
              <span class="lead-avatar">${escapeHtml(project.manager)}</span>
              <span class="lead-label">Lead</span>
            </div>
            <div class="team-members">
              ${project.team
                .map(
                  (member) => `
                    <div class="member-chip">
                      <span class="member-avatar">${escapeHtml(member.name.charAt(0))}</span>
                      <span class="member-tooltip">${escapeHtml(member.name)} • ${escapeHtml(member.role)}</span>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function filteredAssets() {
  return assetsDatabase.filter((asset) => {
    const query = state.searchQuery.trim().toLowerCase();
    const matchesSearch =
      query === "" ||
      asset.title.toLowerCase().includes(query) ||
      asset.format.toLowerCase().includes(query) ||
      asset.category.toLowerCase().includes(query);
    const matchesFilter = state.activeFilter === "All" || asset.category === state.activeFilter;
    return matchesSearch && matchesFilter;
  });
}

function renderAssetFilters() {
  assetFilters.innerHTML = filters
    .map(
      (filter) => `
        <button class="filter-btn ${state.activeFilter === filter ? "is-active" : ""}" data-filter="${filter}">
          ${escapeHtml(filter)}
        </button>
      `,
    )
    .join("");
}

function renderAssets() {
  const results = filteredAssets();

  assetGrid.innerHTML =
    results.length === 0
      ? `
        <div class="empty-state">
          ${icon("search")}
          <div>No assets found matching your criteria.</div>
        </div>
      `
      : results
          .map(
            (asset) => `
              <article class="asset-card">
                <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.title)}" />
                <div class="asset-format">${escapeHtml(asset.format)}</div>
                <div class="asset-overlay">
                  <div class="asset-meta">
                    ${asset.category === "3D" ? icon("box") : icon("image")}
                    <span>${escapeHtml(asset.category)}</span>
                  </div>
                  <h3 class="asset-title">${escapeHtml(asset.title)}</h3>
                  <div class="asset-footer">
                    <span class="asset-size">${escapeHtml(asset.size)}</span>
                    <span class="download-btn" aria-hidden="true">${icon("download")}</span>
                  </div>
                </div>
              </article>
            `,
          )
          .join("");
}

function renderAssistant() {
  assistantStarters.innerHTML = studioData.assistant.starters
    .map(
      (prompt) => `
        <button class="assistant-starter" data-starter-prompt="${escapeHtml(prompt)}" type="button">
          ${escapeHtml(prompt)}
        </button>
      `,
    )
    .join("");

  assistantMessages.innerHTML = state.chat.messages
    .map(
      (message) => `
        <article class="assistant-message ${message.role === "user" ? "is-user" : "is-assistant"}">
          <div class="assistant-message-label">${message.role === "user" ? "You" : "AI"}</div>
          <div class="assistant-message-body">${nl2br(message.content)}</div>
        </article>
      `,
    )
    .join("");

  assistantInput.value = state.chat.input;
  assistantInput.disabled = state.chat.sending;
  assistantSend.disabled = state.chat.sending;

  if (state.chat.sending) {
    assistantStatus.textContent = "Thinking…";
  } else if (state.chat.error) {
    assistantStatus.textContent = state.chat.error;
  } else {
    assistantStatus.textContent = "Live AI via /api/chat";
  }

  assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

function renderAll() {
  renderCanvas();
  renderProjects();
  renderAssetFilters();
  renderAssets();
  renderAssistant();
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

async function sendChatMessage(rawText) {
  const content = rawText.trim();
  if (!content || state.chat.sending) return;

  state.chat.messages.push({ role: "user", content });
  state.chat.input = "";
  state.chat.error = "";
  state.chat.sending = true;
  renderAssistant();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: state.chat.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `AI request failed with status ${response.status}.`);
    }

    state.chat.messages.push({
      role: "assistant",
      content: payload.reply || "I couldn't produce a reply just now.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI service is currently unavailable.";
    state.chat.error = message;
    state.chat.messages.push({
      role: "assistant",
      content: `现在还没有拿到 AI 回复。\n\n${message}`,
    });
  } finally {
    state.chat.sending = false;
    renderAssistant();
  }
}

document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.viewTarget));
});

brandButton?.addEventListener("click", () => {
  openOverviewCanvas();
});

canvasBackBtn?.addEventListener("click", () => {
  openOverviewCanvas();
});

projectRows.addEventListener("click", (event) => {
  const row = event.target.closest("[data-project-id]");
  if (!row) return;
  openProjectCanvas(row.dataset.projectId || "");
});

projectRows.addEventListener("keydown", (event) => {
  const row = event.target.closest("[data-project-id]");
  if (!row) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openProjectCanvas(row.dataset.projectId || "");
  }
});

canvasViewport.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".canvas-hud")) return;
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

function endCanvasInteraction() {
  if (!state.interaction.mode) return;

  state.interaction.mode = null;
  state.interaction.nodeId = null;
  canvasViewport.classList.remove("is-panning");
  persistActiveBoard();
  renderCanvas();
}

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
  if (event.target.closest(".canvas-hud")) return;
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

resetViewBtn.addEventListener("click", () => {
  const board = getActiveBoard();
  board.camera = cloneValue(board.defaultCamera);
  persistActiveBoard();
  renderCanvas();
});

assetFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.activeFilter = button.dataset.filter;
  renderAssetFilters();
  renderAssets();
});

assetSearch.addEventListener("input", (event) => {
  state.searchQuery = event.target.value;
  renderAssets();
});

assistantStarters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-starter-prompt]");
  if (!button) return;
  void sendChatMessage(button.dataset.starterPrompt || "");
});

assistantInput.addEventListener("input", (event) => {
  state.chat.input = event.target.value;
});

assistantInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void sendChatMessage(state.chat.input);
  }
});

assistantComposer.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendChatMessage(state.chat.input);
});

window.addEventListener("resize", () => {
  renderCanvas();
});

renderAll();
