import {
  assetsDatabase,
  buildWorkspaceLink,
  escapeHtml,
  filters,
  icon,
  nl2br,
  projectIndex,
  studioData,
} from "./shared/studio-data-client.js?v=2026-04-02-assets-2";
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
import { setupWebApp } from "./shared/register-web-app.js?v=2026-04-02-assets-2";

setupWebApp();

const ASSETS_STATIC_AI_HINT = "AI requires a server backend. GitHub Pages serves the static portfolio only.";
const ASSETS_STATIC_AI_RECOVERY =
  "AI requires a server backend. GitHub Pages serves the static portfolio only. Deploy `/api/chat` on a Node-capable host to enable it.";

const state = {
  activeFilter: "All",
  searchQuery: "",
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
    backendReady: false,
    showStarters: true,
  },
  ui: {
    isAssistantOpen: false,
  },
};

const assetGrid = document.getElementById("assetGrid");
const assetFilters = document.getElementById("assetFilters");
const assetSearch = document.getElementById("assetSearch");
const assistantCompanion = document.getElementById("assistantCompanion");
const assistantPanel = document.getElementById("assistantPanel");
const assistantCloseBtn = document.getElementById("assistantCloseBtn");
const assistantBody = document.getElementById("assistantBody");
const assistantStartersRegion = document.getElementById("assistantStartersRegion");
const assistantStarters = document.getElementById("assistantStarters");
const assistantTimeline = document.getElementById("assistantTimeline");
const assistantMessages = document.getElementById("assistantMessages");
const assistantStatus = document.getElementById("assistantStatus");
const assistantInput = document.getElementById("assistantInput");
const assistantSend = document.getElementById("assistantSend");
const assistantComposer = document.getElementById("assistantComposer");

function filteredAssets() {
  return assetsDatabase.filter((asset) => {
    const query = state.searchQuery.trim().toLowerCase();
    const project = asset.projectId ? projectIndex.get(asset.projectId) : null;
    const searchableFields = [
      asset.title,
      asset.format,
      asset.category,
      asset.groupName,
      asset.sourceLabel,
      asset.searchText,
      project?.id,
      project?.name,
      project?.client,
    ]
      .filter((value) => typeof value === "string" && value.trim())
      .join(" ")
      .toLowerCase();
    const matchesSearch =
      query === "" || searchableFields.includes(query);
    const matchesFilter = state.activeFilter === "All" || asset.category === state.activeFilter;
    return matchesSearch && matchesFilter;
  });
}

function getAssetProject(asset) {
  return asset.projectId ? projectIndex.get(asset.projectId) : null;
}

function renderAssetFilters() {
  assetFilters.innerHTML = filters
    .map(
      (filter) => `
        <button class="filter-btn ${state.activeFilter === filter ? "is-active" : ""}" data-filter="${filter}" type="button">
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
      : `
        <div class="asset-feed">
          ${results.map((asset, index) => renderAssetCard(asset, index)).join("")}
        </div>
      `;
}

function renderAssetCard(asset, index) {
  const project = getAssetProject(asset);
  const cardClasses = ["asset-card"];
  if (asset.isFeatured || index % 7 === 0) {
    cardClasses.push("is-featured");
  }

  return `
    <article class="${cardClasses.join(" ")}">
      <div class="asset-cover">
        <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.title)}" />
        <div class="asset-format">${escapeHtml(asset.format)}</div>
      </div>
      <div class="asset-content">
        ${renderAssetOverlay(project, asset)}
      </div>
    </article>
  `;
}

function renderAssetOverlay(project, asset) {
  const secondaryActionLabel = asset.actionLabel || "Open archive";

  return `
    <div class="asset-meta">
      ${project ? `<span class="asset-project-pill">${escapeHtml(project.id)}</span>` : `<span class="asset-project-pill">ARCHIVE</span>`}
      <div class="asset-actions">
        ${
          project
            ? `
              <a
                class="asset-action"
                href="${escapeHtml(buildWorkspaceLink(asset.projectId))}"
                aria-label="Open project"
                title="Open project"
              >
                ${icon("arrow")}
                <span class="sr-only">Open project</span>
              </a>
            `
            : ""
        }
        ${
          asset.fileUrl
            ? `
              <a
                class="asset-action is-secondary"
                href="${escapeHtml(asset.fileUrl)}"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="${escapeHtml(secondaryActionLabel)}"
                title="${escapeHtml(secondaryActionLabel)}"
              >
                ${icon("download")}
                <span class="sr-only">${escapeHtml(secondaryActionLabel)}</span>
              </a>
            `
            : ""
        }
      </div>
    </div>
    <h3 class="asset-title">${escapeHtml(asset.title)}</h3>
    <div class="asset-source">${escapeHtml(project?.name || asset.groupName || "Independent Archive")}</div>
    <div class="asset-source-detail">${escapeHtml(asset.sourceLabel || asset.groupName || "")}</div>
  `;
}

function renderAssistant() {
  assistantPanel.hidden = !state.ui.isAssistantOpen;
  assistantBody?.setAttribute("data-assistant-open", state.ui.isAssistantOpen ? "true" : "false");
  assistantTimeline?.setAttribute("aria-busy", state.chat.sending ? "true" : "false");
  assistantStartersRegion.dataset.state = state.chat.showStarters ? "visible" : "hidden";
  assistantStartersRegion.hidden = !state.chat.showStarters;
  assistantStarters.innerHTML = renderAssistantStarters(studioData.assistant.starters, escapeHtml);
  assistantMessages.innerHTML = renderAssistantMessages(state.chat.messages, { nl2br });

  assistantInput.value = state.chat.input;
  assistantInput.disabled = state.chat.sending;
  assistantSend.disabled = state.chat.sending;

  if (state.chat.sending) {
    assistantStatus.textContent = "Thinking through the asset library…";
  } else if (state.chat.error) {
    assistantStatus.textContent = state.chat.error;
  } else if (state.chat.backendReady) {
    assistantStatus.textContent = "Asset AI backend connected.";
  } else {
    assistantStatus.textContent = ASSETS_STATIC_AI_HINT;
  }

  assistantTimeline.scrollTop = assistantTimeline.scrollHeight;
}

function openAssistantPanel(options = {}) {
  state.ui.isAssistantOpen = true;
  renderAssistant();

  if (options.focusInput) {
    focusAssistantInput(assistantInput);
  }
}

function closeAssistantPanel() {
  if (!state.ui.isAssistantOpen) return;
  state.ui.isAssistantOpen = false;
  renderAssistant();
}

function handleAssistantShortcut(event) {
  const isSpaceShortcut = event.code === "Space" || event.key === " " || event.key === "Spacebar";
  if (isSpaceShortcut && shouldOpenAssistantFromSpace(event, document.activeElement)) {
    event.preventDefault();
    if (!event.repeat) {
      openAssistantPanel({ focusInput: true });
    }
    return true;
  }

  return false;
}

async function sendChatMessage(rawText) {
  const content = rawText.trim();
  if (!content || state.chat.sending) return;

  state.ui.isAssistantOpen = true;
  state.chat.messages.push({ role: "user", content });
  state.chat.messages.push({
    role: "assistant",
    content: "",
    pending: true,
    streaming: true,
  });
  state.chat.input = "";
  state.chat.error = "";
  state.chat.sending = true;
  state.chat.showStarters = false;
  renderAssistant();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        agent: "assets",
        stream: true,
        messages: serializeAssistantMessages(state.chat.messages),
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `AI request failed with status ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream") && response.body?.getReader) {
      const reader = response.body.getReader();
      let sawChunk = false;
      let streamError = "";

      await consumeAssistantEventReader(reader, {
        onChunk(payload) {
          appendPendingAssistantMessage(state.chat.messages, payload.delta);
          state.chat.backendReady = true;
          sawChunk = true;
          renderAssistant();
        },
        onError(payload) {
          streamError = typeof payload.error === "string" ? payload.error : "AI stream failed.";
        },
        onDone() {
          finalizePendingAssistantMessage(state.chat.messages);
          renderAssistant();
        },
      });

      if (streamError) {
        state.chat.error = streamError;
        const pendingIndex = getPendingAssistantIndex(state.chat.messages);
        const pendingMessage = pendingIndex === -1 ? null : state.chat.messages[pendingIndex];
        if (pendingMessage?.content) {
          finalizePendingAssistantMessage(state.chat.messages, pendingMessage.content);
        } else {
          replacePendingAssistantMessage(state.chat.messages, `现在还没有拿到 AI 回复。\n\n${streamError}`);
        }
        return;
      }

      if (!sawChunk) {
        throw new Error("AI stream ended before any content arrived.");
      }

      finalizePendingAssistantMessage(state.chat.messages);
    } else {
      const payload = await response.json().catch(() => ({}));
      state.chat.backendReady = true;
      replacePendingAssistantMessage(state.chat.messages, payload.reply || "I couldn't produce a reply just now.");
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "AI service is currently unavailable.";
    const message =
      /status 404|failed to fetch|load failed/i.test(rawMessage) ? ASSETS_STATIC_AI_RECOVERY : rawMessage;
    state.chat.error = message;
    const pendingIndex = getPendingAssistantIndex(state.chat.messages);
    const pendingMessage = pendingIndex === -1 ? null : state.chat.messages[pendingIndex];
    if (pendingMessage?.content) {
      finalizePendingAssistantMessage(state.chat.messages, pendingMessage.content);
    } else {
      replacePendingAssistantMessage(state.chat.messages, `现在还没有拿到 AI 回复。\n\n${message}`);
    }
  } finally {
    state.chat.sending = false;
    renderAssistant();
  }
}

assetFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.activeFilter = button.dataset.filter || "All";
  renderAssetFilters();
  renderAssets();
});

assetSearch.addEventListener("input", (event) => {
  state.searchQuery = event.target.value;
  renderAssets();
});

assistantCompanion?.addEventListener("click", () => {
  openAssistantPanel({ focusInput: true });
});

assistantCloseBtn?.addEventListener("click", () => {
  closeAssistantPanel();
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

document.addEventListener("keydown", (event) => {
  handleAssistantShortcut(event);
});

window.addEventListener("keydown", (event) => {
  if (event.defaultPrevented) {
    return;
  }

  if (handleAssistantShortcut(event)) {
    return;
  }

  if (event.key === "Escape" && state.ui.isAssistantOpen) {
    event.preventDefault();
    closeAssistantPanel();
  }
});

renderAssetFilters();
renderAssets();
renderAssistant();
