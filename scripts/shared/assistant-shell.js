export function buildThinkingMarkup() {
  return `
    <div class="assistant-thinking" role="status" aria-label="AI is thinking">
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
    </div>
  `;
}

export function getPendingAssistantIndex(messages) {
  return messages.findIndex((message) => message.pending);
}

export function replacePendingAssistantMessage(messages, content) {
  const pendingIndex = getPendingAssistantIndex(messages);
  if (pendingIndex === -1) return;

  messages[pendingIndex] = {
    role: "assistant",
    content,
  };
}

export function setPendingAssistantContent(messages, content) {
  const pendingIndex = getPendingAssistantIndex(messages);
  if (pendingIndex === -1) return;

  messages[pendingIndex] = {
    ...messages[pendingIndex],
    content,
    pending: true,
    streaming: true,
  };
}

export function appendPendingAssistantMessage(messages, delta) {
  const pendingIndex = getPendingAssistantIndex(messages);
  if (pendingIndex === -1 || !delta) return;

  const pendingMessage = messages[pendingIndex];
  messages[pendingIndex] = {
    ...pendingMessage,
    content: `${pendingMessage.content || ""}${delta}`,
    pending: true,
    streaming: true,
  };
}

export function finalizePendingAssistantMessage(messages, fallbackText = "") {
  const pendingIndex = getPendingAssistantIndex(messages);
  if (pendingIndex === -1) return "";

  const pendingMessage = messages[pendingIndex];
  const content = String(pendingMessage.content || fallbackText || "").trim() || fallbackText;
  messages[pendingIndex] = {
    role: "assistant",
    content,
  };
  return content;
}

export function serializeAssistantMessages(messages) {
  return messages
    .filter((message) => !message.pending)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

export function renderAssistantStarters(prompts, escapeHtml) {
  return prompts
    .map(
      (prompt) =>
        `<button class="assistant-starter" data-starter-prompt="${escapeHtml(prompt)}" type="button">${escapeHtml(prompt)}</button>`,
    )
    .join("");
}

export function buildAssistantBodyMarkup(message, nl2br) {
  if (message.pending && !message.content) {
    return buildThinkingMarkup();
  }

  const cursor = message.pending ? '<span class="assistant-stream-cursor" aria-hidden="true"></span>' : "";
  return `${nl2br(message.content)}${cursor}`;
}

export function renderAssistantMessages(messages, { assistantLabel = "AI", userLabel = "You", nl2br }) {
  return messages
    .map(
      (message) => `
        <article class="assistant-message ${message.role === "user" ? "is-user" : "is-assistant"} ${message.pending && !message.content ? "is-thinking" : ""} ${message.pending ? "is-streaming" : ""}">
          <div class="assistant-message-label">${message.role === "user" ? userLabel : assistantLabel}</div>
          <div class="assistant-message-body">${buildAssistantBodyMarkup(message, nl2br)}</div>
        </article>
      `,
    )
    .join("");
}

export function focusAssistantInput(input) {
  requestAnimationFrame(() => {
    input?.focus({ preventScroll: true });
    if (typeof input?.selectionStart === "number") {
      const caret = input.value.length;
      input.setSelectionRange(caret, caret);
    }
  });
}

function isBlockedShortcutTarget(target) {
  if (!target?.matches) return false;
  if (target.matches("[data-clipboard-trap]")) return false;

  return target.matches(
    "textarea, input, select, button, a, summary, [contenteditable='true'], [role='button'], [role='textbox'], [role='listbox']",
  );
}

export function shouldOpenAssistantFromSpace(event, target = document.activeElement) {
  const isSpaceShortcut = event.code === "Space" || event.key === " " || event.key === "Spacebar";

  if (!isSpaceShortcut || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  return !isBlockedShortcutTarget(target);
}

function parseAssistantEventChunk(block) {
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

export async function consumeAssistantEventReader(reader, handlers = {}) {
  const decoder = new TextDecoder();
  let buffer = "";

  const flushBuffer = async () => {
    let separatorMatch = buffer.match(/\r?\n\r?\n/);
    let separatorIndex = separatorMatch?.index ?? -1;

    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex).trim();
      const consumedLength = separatorMatch?.[0]?.length || 2;
      buffer = buffer.slice(separatorIndex + consumedLength);

      if (block) {
        const payload = parseAssistantEventChunk(block);
        if (payload?.type === "chunk" && typeof payload.delta === "string" && payload.delta) {
          await handlers.onChunk?.(payload);
        } else if (payload?.type === "error") {
          await handlers.onError?.(payload);
        } else if (payload?.type === "done") {
          await handlers.onDone?.(payload);
        } else if (payload?.type === "tool_call_start") {
          await handlers.onToolCallStart?.(payload);
        } else if (payload?.type === "tool_call_end") {
          await handlers.onToolCallEnd?.(payload);
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
    await flushBuffer();
  }

  buffer += decoder.decode();
  await flushBuffer();
}
