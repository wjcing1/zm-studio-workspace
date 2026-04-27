# Projects AI Mobile Sheet Design

## Goal

Refine the `projects.html` AI assistant so it keeps the current trigger location, panel size, and open/close entry points, but feels more like the GPT mobile chat experience inside the panel. The assistant should stream replies token-by-token, keep the composer fixed at the bottom, and automatically dismiss starter prompts after the first user message.

## Product Direction

- Preserve the current floating-dot trigger in the lower-right corner.
- Preserve the current panel footprint and fixed-position reveal behavior.
- Replace the current static "card stack" feeling with a chat-first layout inspired by GPT mobile.
- Avoid introducing a new dialog or component library.
- Keep the implementation inside the existing vanilla HTML, CSS, JavaScript, and Node server stack.

## User Experience

### Opening And Closing

- The assistant still opens from the current lower-right pulse trigger.
- Pressing `Space` outside inputs still opens the panel and focuses the composer.
- Pressing `Escape` still closes the panel.
- The panel still appears in the same anchored location and at the same overall size as today.

### Internal Chat Layout

- The inside of the panel becomes a chat sheet:
  - fixed header
  - scrollable message timeline
  - fixed composer
- The message timeline should visually prioritize the conversation over the starter prompts.
- Status and error states should stay visible without pushing the composer off-screen.

### Starter Prompt Behavior

- Starter prompts are shown when the assistant opens with no real conversation history.
- Once the user sends the first message, the starter prompts automatically collapse and stay hidden for the remainder of that session.
- The starter area should not leave dead space behind after it collapses.

### Streaming Behavior

- Sending a prompt immediately appends a user bubble and an empty assistant bubble.
- The assistant bubble fills incrementally as streamed text arrives.
- The timeline keeps itself near the latest content while streaming, similar to GPT mobile.
- If the stream errors after partial output, the partial assistant content remains visible and the error is surfaced in the status area.
- If the stream fails before content arrives, the pending assistant bubble is replaced with a clear fallback error message.

## Architecture

### Frontend Responsibilities

- Maintain a conversation state with:
  - `messages`
  - `input`
  - `sending`
  - `error`
  - `backendReady`
  - `showStarters`
- Render the projects assistant as one fixed shell with three internal regions:
  - header
  - scrollable timeline
  - composer/status footer
- Read a streamed response from `/api/chat` and append chunks into the pending assistant message.
- Auto-scroll the timeline as new content arrives, but only within the assistant panel.

### Backend Responsibilities

- Extend `POST /api/chat` so it can optionally return a streamed text response.
- Preserve the existing non-stream JSON response for callers that do not opt in.
- Build the same portfolio-aware prompt as today so assets and projects pages continue to use the same core assistant context.
- Return meaningful API errors in both JSON and stream modes.

## API Contract

### Request

The client sends the existing `messages` payload plus a transport hint such as `stream: true`.

### Response Modes

- `stream: false` or omitted:
  - existing JSON contract remains unchanged
- `stream: true`:
  - response uses chunked text streaming
  - each emitted chunk contains assistant text only
  - the stream ends cleanly when generation completes

The stream format should be intentionally small and easy to parse in the current frontend. Server-Sent Events are acceptable if they keep the implementation straightforward and predictable in vanilla JavaScript.

## Error Handling

- Missing `OPENAI_API_KEY` should continue to return a clear `503`.
- Stream readers must handle:
  - network interruption
  - upstream AI failure
  - empty completion
- Partial content should not be discarded when a later chunk fails.
- Static-hosting fallback messaging should remain intact when `/api/chat` is unavailable.

## Testing Strategy

- Add structural tests for the refreshed Projects AI sheet markers and starter-region behavior hooks.
- Add an API contract test that confirms `/api/chat` still returns `503` without a key in both JSON and streaming mode.
- Add a browser behavior test that confirms:
  - the panel opens from the same trigger
  - starter prompts auto-hide after the first sent message
  - streamed text appears incrementally instead of arriving in one final block
- Re-run existing Projects AI shortcut and scroll regressions after the refactor.

## Non-Goals

- Changing the panel footprint or moving it to a different screen edge
- Adding drag-to-dismiss interactions
- Building a separate Projects-only AI endpoint
- Adding AI write-back actions that mutate project records
