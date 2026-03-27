# Assistant Thinking Indicator Design

## Goal
Add a visible AI "thinking" message bubble to the `Assets` chat panel so users get immediate feedback after sending a message instead of feeling like the UI is stalled.

## User Experience
- As soon as the user sends a message, the thread should append an AI bubble placeholder.
- The placeholder should feel alive, using a compact three-dot animation instead of static text.
- When the backend reply arrives, the placeholder should be replaced by the final assistant answer in the same thread position.
- If the request fails, the placeholder should be replaced by the existing error-style assistant message so the thread still explains what happened.

## Interaction Model
- The existing `assistantStatus` text can keep showing `Thinking…` while a request is in flight.
- The new feedback should live inside the message thread itself because that is where users are already looking.
- Only one pending request is allowed at a time, matching the current `sending` guard.

## Data Flow
- Extend the in-memory chat message shape with a lightweight `pending` flag for transient assistant placeholders.
- On submit:
  - push the user message
  - push one pending assistant message
  - render immediately
- On success:
  - replace the pending message with the returned assistant content
- On failure:
  - replace the pending message with the existing fallback error text

## Rendering
- Render pending assistant messages with an `is-thinking` modifier class.
- Inside that bubble, swap the normal text body for a small three-dot loader element.
- Keep the label as `AI` so the thread remains consistent.

## Styling
- Reuse the existing assistant card styling as the base.
- Add a subtle animated dot sequence that fits the current glassy dark UI.
- Keep the animation lightweight and CSS-only.

## Testing
- Add a browser-level verification that delays `/api/chat`, submits a message, and confirms a `.assistant-message.is-thinking` bubble appears before the response resolves.
- Keep existing chat API contract tests unchanged.
