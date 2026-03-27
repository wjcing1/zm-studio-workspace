# Assistant Thinking Indicator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an animated AI thinking bubble to the assets chat thread while `/api/chat` is in flight.

**Architecture:** The assets page already stores chat messages in local state and renders the whole thread from that array. We will add a transient pending assistant message shape, verify it appears with a browser test, and then replace it with the final backend reply or fallback error text.

**Tech Stack:** Browser JavaScript, CSS animations, existing Node static server, Playwright CLI-based browser verification scripts.

---

### Task 1: Add a Failing Browser Verification

**Files:**
- Create: `/Users/jiachenwang/Desktop/ai工作室/tests/verify-chat-thinking-indicator.mjs`
- Modify: `/Users/jiachenwang/Desktop/ai工作室/tests/run-all.mjs`

**Step 1: Write the failing test**

- Open `http://127.0.0.1:4173/assets.html`.
- Override `window.fetch` for `/api/chat` so the response is delayed briefly.
- Submit a chat message through the existing composer.
- Assert that the thread renders one `.assistant-message.is-thinking` bubble before the delayed request completes.

**Step 2: Run test to verify it fails**

Run:

```bash
node tests/verify-chat-thinking-indicator.mjs
```

Expected:
- FAIL because the current UI only changes the footer status text and does not render a thinking bubble in the thread.

**Step 3: Write minimal implementation**

- No production implementation in this task.

**Step 4: Run test to verify it passes**

- Covered after Task 2.

### Task 2: Render the Thinking Bubble

**Files:**
- Modify: `/Users/jiachenwang/Desktop/ai工作室/scripts/assets-page.js`
- Modify: `/Users/jiachenwang/Desktop/ai工作室/styles/assets.css`

**Step 1: Write the failing test**

- The browser verification from Task 1 covers this behavior.

**Step 2: Run test to verify it fails**

- Already covered by Task 1.

**Step 3: Write minimal implementation**

- Add a transient pending assistant message object when sending begins.
- Render pending assistant messages with `is-thinking`.
- Replace the pending message with the final reply or fallback error text.
- Add CSS for a three-dot animated loader inside the pending bubble.

**Step 4: Run test to verify it passes**

Run:

```bash
node tests/verify-chat-thinking-indicator.mjs
```

Expected:
- PASS because the delayed request now shows the animated AI placeholder in the thread.

### Task 3: Regression Verification

**Files:**
- Modify: `/Users/jiachenwang/Desktop/ai工作室/tests/run-all.mjs`

**Step 1: Write the failing test**

- No new test beyond the existing suite changes.

**Step 2: Run test to verify it fails**

- Not needed.

**Step 3: Write minimal implementation**

- Ensure the new browser verification runs alongside existing checks.

**Step 4: Run test to verify it passes**

Run:

```bash
node tests/verify-chat-ui.mjs
node tests/verify-chat-thinking-indicator.mjs
node tests/verify-chat-api.mjs
```

Expected:
- All pass.
