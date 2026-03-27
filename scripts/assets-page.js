import {
  assetsDatabase,
  escapeHtml,
  filters,
  icon,
  nl2br,
  studioData,
} from "./shared/studio-data-client.js";
import { setupWebApp } from "./shared/register-web-app.js";

setupWebApp();

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
  },
};

const assetGrid = document.getElementById("assetGrid");
const assetFilters = document.getElementById("assetFilters");
const assetSearch = document.getElementById("assetSearch");
const assistantMessages = document.getElementById("assistantMessages");
const assistantStarters = document.getElementById("assistantStarters");
const assistantStatus = document.getElementById("assistantStatus");
const assistantInput = document.getElementById("assistantInput");
const assistantSend = document.getElementById("assistantSend");
const assistantComposer = document.getElementById("assistantComposer");

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

renderAssetFilters();
renderAssets();
renderAssistant();
