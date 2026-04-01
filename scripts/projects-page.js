import {
  escapeHtml,
  icon,
  nl2br,
  projectDatabase,
  statusClass,
} from "./shared/studio-data-client.js";
import { setupWebApp } from "./shared/register-web-app.js?v=2026-03-30-auth-1";

setupWebApp();

const PROJECTS_STATIC_AI_HINT = "Project AI requires a server backend. GitHub Pages serves the static project ledger only.";
const PROJECTS_STATIC_AI_RECOVERY =
  "Project AI requires a server backend. GitHub Pages serves the static project ledger only. Deploy `/api/chat` on a Node-capable host to enable it.";
const PROJECTS_ASSISTANT_STARTERS = [
  "帮我总结当前项目库，告诉我最值得先看的 3 个项目。",
  "按年份、状态和客户角度，帮我梳理一遍项目库重点。",
  "如果我要挑案例展示，先推荐哪些项目，为什么？",
];

const state = {
  chat: {
    messages: [
      {
        role: "assistant",
        content: "我是项目库的 AI 项目管理助手。你可以让我总结项目、给筛选建议，或者帮你挑最适合先推进和展示的项目。",
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

const projectRows = document.getElementById("projectRows");
const projectStatus = document.getElementById("projectStatus");
const projectsAssistantCompanion = document.getElementById("projectsAssistantCompanion");
const projectsAssistantPanel = document.getElementById("projectsAssistantPanel");
const projectsAssistantCloseBtn = document.getElementById("projectsAssistantCloseBtn");
const projectsAssistantBody = document.getElementById("projectsAssistantBody");
const projectsAssistantStartersRegion = document.getElementById("projectsAssistantStartersRegion");
const projectsAssistantStarters = document.getElementById("projectsAssistantStarters");
const projectsAssistantTimeline = document.getElementById("projectsAssistantTimeline");
const projectsAssistantMessages = document.getElementById("projectsAssistantMessages");
const projectsAssistantStatus = document.getElementById("projectsAssistantStatus");
const projectsAssistantInput = document.getElementById("projectsAssistantInput");
const projectsAssistantSend = document.getElementById("projectsAssistantSend");
const projectsAssistantComposer = document.getElementById("projectsAssistantComposer");

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

      return `
        <div
          class="grid-row"
          data-project-id="${escapeHtml(project.id)}"
          data-workspace-url="./workspace.html?project=${encodeURIComponent(project.id)}"
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

function buildThinkingMarkup() {
  return `
    <div class="assistant-thinking" role="status" aria-label="AI is thinking">
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
    </div>
  `;
}

function getPendingAssistantIndex() {
  return state.chat.messages.findIndex((message) => message.pending);
}

function replacePendingAssistantMessage(content) {
  const pendingIndex = getPendingAssistantIndex();
  if (pendingIndex === -1) return;

  state.chat.messages[pendingIndex] = {
    role: "assistant",
    content,
  };
}

function appendPendingAssistantMessage(delta) {
  const pendingIndex = getPendingAssistantIndex();
  if (pendingIndex === -1 || !delta) return;

  const pendingMessage = state.chat.messages[pendingIndex];
  state.chat.messages[pendingIndex] = {
    ...pendingMessage,
    content: `${pendingMessage.content || ""}${delta}`,
    pending: true,
    streaming: true,
  };
}

function finalizePendingAssistantMessage(fallbackText = "") {
  const pendingIndex = getPendingAssistantIndex();
  if (pendingIndex === -1) return;

  const pendingMessage = state.chat.messages[pendingIndex];
  const content = String(pendingMessage.content || fallbackText || "").trim() || fallbackText;
  state.chat.messages[pendingIndex] = {
    role: "assistant",
    content,
  };
}

function scrollAssistantTimelineToLatest() {
  projectsAssistantTimeline.scrollTop = projectsAssistantTimeline.scrollHeight;
}

function buildAssistantBodyMarkup(message) {
  if (message.pending && !message.content) {
    return buildThinkingMarkup();
  }

  const cursor = message.pending ? '<span class="assistant-stream-cursor" aria-hidden="true"></span>' : "";
  return `${nl2br(message.content)}${cursor}`;
}

function renderAssistant() {
  projectsAssistantPanel.hidden = !state.ui.isAssistantOpen;
  projectsAssistantBody?.setAttribute("data-assistant-open", state.ui.isAssistantOpen ? "true" : "false");
  projectsAssistantTimeline?.setAttribute("aria-busy", state.chat.sending ? "true" : "false");
  projectsAssistantStartersRegion.dataset.state = state.chat.showStarters ? "visible" : "hidden";
  projectsAssistantStartersRegion.hidden = !state.chat.showStarters;

  projectsAssistantStarters.innerHTML = PROJECTS_ASSISTANT_STARTERS.map(
    (prompt) =>
      `<button class="assistant-starter" data-starter-prompt="${escapeHtml(prompt)}" type="button">${escapeHtml(prompt)}</button>`,
  ).join("");

  projectsAssistantMessages.innerHTML = state.chat.messages
    .map(
      (message) => `
        <article class="assistant-message ${message.role === "user" ? "is-user" : "is-assistant"} ${message.pending && !message.content ? "is-thinking" : ""} ${message.pending ? "is-streaming" : ""}">
          <div class="assistant-message-label">${message.role === "user" ? "You" : "AI"}</div>
          <div class="assistant-message-body">${buildAssistantBodyMarkup(message)}</div>
        </article>
      `,
    )
    .join("");

  projectsAssistantInput.value = state.chat.input;
  projectsAssistantInput.disabled = state.chat.sending;
  projectsAssistantSend.disabled = state.chat.sending;

  if (state.chat.sending) {
    projectsAssistantStatus.textContent = "Thinking through the project library…";
  } else if (state.chat.error) {
    projectsAssistantStatus.textContent = state.chat.error;
  } else if (state.chat.backendReady) {
    projectsAssistantStatus.textContent = "Project AI backend connected.";
  } else {
    projectsAssistantStatus.textContent = PROJECTS_STATIC_AI_HINT;
  }

  scrollAssistantTimelineToLatest();
}

function focusAssistantInput() {
  requestAnimationFrame(() => {
    projectsAssistantInput?.focus({ preventScroll: true });
    if (typeof projectsAssistantInput?.selectionStart === "number") {
      const caret = projectsAssistantInput.value.length;
      projectsAssistantInput.setSelectionRange(caret, caret);
    }
  });
}

function openAssistantPanel(options = {}) {
  state.ui.isAssistantOpen = true;
  renderAssistant();

  if (options.focusInput) {
    focusAssistantInput();
  }
}

function closeAssistantPanel() {
  if (!state.ui.isAssistantOpen) return;
  state.ui.isAssistantOpen = false;
  renderAssistant();
}

function handleAssistantShortcut(event) {
  const target = document.activeElement;
  const isTypingTarget = target?.matches?.("textarea, input");
  const isSpaceShortcut = event.code === "Space" || event.key === " " || event.key === "Spacebar";

  if (isSpaceShortcut && !isTypingTarget) {
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
        stream: true,
        messages: state.chat.messages
          .filter((message) => !message.pending)
          .map((message) => ({
            role: message.role,
            content: message.content,
          })),
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `AI request failed with status ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      await consumeAssistantEventStream(response);
    } else {
      const payload = await response.json().catch(() => ({}));
      state.chat.backendReady = true;
      replacePendingAssistantMessage(payload.reply || "I couldn't produce a reply just now.");
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "AI service is currently unavailable.";
    const message =
      /status 404|failed to fetch|load failed/i.test(rawMessage) ? PROJECTS_STATIC_AI_RECOVERY : rawMessage;
    state.chat.error = message;
    const pendingIndex = getPendingAssistantIndex();
    const pendingMessage = pendingIndex === -1 ? null : state.chat.messages[pendingIndex];
    if (pendingMessage?.content) {
      finalizePendingAssistantMessage(pendingMessage.content);
    } else {
      replacePendingAssistantMessage(`现在还没有拿到项目管理建议。\n\n${message}`);
    }
  } finally {
    state.chat.sending = false;
    renderAssistant();
  }
}

function consumeAssistantEventChunk(block) {
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  if (dataLines.length === 0) {
    return null;
  }

  return JSON.parse(dataLines.join("\n"));
}

async function consumeAssistantEventStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawChunk = false;
  let streamError = "";

  const flushBuffer = () => {
    let separatorMatch = buffer.match(/\r?\n\r?\n/);
    let separatorIndex = separatorMatch?.index ?? -1;

    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex).trim();
      const consumedLength = separatorMatch?.[0]?.length || 2;
      buffer = buffer.slice(separatorIndex + consumedLength);

      if (block) {
        const payload = consumeAssistantEventChunk(block);
        if (payload?.type === "chunk" && typeof payload.delta === "string" && payload.delta) {
          appendPendingAssistantMessage(payload.delta);
          sawChunk = true;
          state.chat.backendReady = true;
          renderAssistant();
        } else if (payload?.type === "error" && typeof payload.error === "string") {
          streamError = payload.error;
        } else if (payload?.type === "done") {
          finalizePendingAssistantMessage();
          renderAssistant();
        }
      }

      separatorMatch = buffer.match(/\r?\n\r?\n/);
      separatorIndex = separatorMatch?.index ?? -1;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    flushBuffer();
  }

  buffer += decoder.decode();
  flushBuffer();

  if (streamError) {
    state.chat.error = streamError;
    const pendingIndex = getPendingAssistantIndex();
    const pendingMessage = pendingIndex === -1 ? null : state.chat.messages[pendingIndex];
    if (pendingMessage?.content) {
      finalizePendingAssistantMessage(pendingMessage.content);
    } else {
      replacePendingAssistantMessage(`现在还没有拿到项目管理建议。\n\n${streamError}`);
    }
    return;
  }

  if (!sawChunk) {
    throw new Error("AI stream ended before any content arrived.");
  }

  finalizePendingAssistantMessage();
}

function openProject(projectId) {
  window.location.assign(`./workspace.html?project=${encodeURIComponent(projectId)}`);
}

projectRows.addEventListener("click", (event) => {
  const row = event.target.closest("[data-project-id]");
  if (!row) return;
  openProject(row.dataset.projectId || "");
});

projectRows.addEventListener("keydown", (event) => {
  const row = event.target.closest("[data-project-id]");
  if (!row) return;

  if (event.key === "Enter") {
    event.preventDefault();
    openProject(row.dataset.projectId || "");
  }
});

projectsAssistantCompanion?.addEventListener("click", () => {
  openAssistantPanel({ focusInput: true });
});

projectsAssistantCloseBtn?.addEventListener("click", () => {
  closeAssistantPanel();
});

projectsAssistantStarters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-starter-prompt]");
  if (!button) return;
  void sendChatMessage(button.dataset.starterPrompt || "");
});

projectsAssistantInput?.addEventListener("input", (event) => {
  state.chat.input = event.target.value;
});

projectsAssistantInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void sendChatMessage(state.chat.input);
  }
});

projectsAssistantComposer?.addEventListener("submit", (event) => {
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

renderProjects();
renderAssistant();
