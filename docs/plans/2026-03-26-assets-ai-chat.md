# Assets AI Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a server-backed AI chat sidebar to the `Digital Assets` page and expose a safe `/api/chat` endpoint that uses shared portfolio data.

**Architecture:** The app will move from a static-only page to a tiny Node server that serves the site and proxies AI requests. Shared studio data will live in JSON so the frontend renderer and the chat backend answer from the same source of truth.

**Tech Stack:** HTML, CSS, browser JavaScript, Node.js built-in HTTP server, OpenAI JavaScript SDK configured for OpenAI's OpenAI-compatible API, JSON data files, custom Node verification scripts.

---

### Task 1: Write Failing Verifications

**Files:**
- Create: `/Users/jiachenwang/Desktop/ai工作室/tests/verify-chat-ui.mjs`
- Create: `/Users/jiachenwang/Desktop/ai工作室/tests/verify-chat-api.mjs`

**Step 1: Write the failing test**

- `verify-chat-ui.mjs` should fail if the `Assets` page does not expose a right-side AI chat shell with starter prompts and a composer.
- `verify-chat-api.mjs` should fail if `/api/chat` does not exist or does not return the documented missing-key error contract.

**Step 2: Run test to verify it fails**

Run:

```bash
node tests/verify-chat-ui.mjs
node tests/verify-chat-api.mjs
```

Expected:
- UI verification fails because no chat shell exists yet.
- API verification fails because no Node server or endpoint exists yet.

**Step 3: Write minimal implementation**

- No implementation in this task.

**Step 4: Run test to verify it passes**

- Covered after Tasks 3 and 4.

### Task 2: Create Shared Studio Data

**Files:**
- Create: `/Users/jiachenwang/Desktop/ai工作室/data/studio-data.json`
- Modify: `/Users/jiachenwang/Desktop/ai工作室/222.html`

**Step 1: Write the failing test**

- The tests from Task 1 already imply the need for structured studio data.

**Step 2: Run test to verify it fails**

- Already covered by Task 1.

**Step 3: Write minimal implementation**

- Move project and asset data into `data/studio-data.json`.
- Add project location and summary fields.
- Update the page to fetch shared data instead of hard-coded arrays.

**Step 4: Run test to verify it passes**

- Re-run UI verification after the frontend is wired.

### Task 3: Implement the Node Server and `/api/chat`

**Files:**
- Create: `/Users/jiachenwang/Desktop/ai工作室/package.json`
- Create: `/Users/jiachenwang/Desktop/ai工作室/server.mjs`
- Create: `/Users/jiachenwang/Desktop/ai工作室/.env.example`
- Modify: `/Users/jiachenwang/Desktop/ai工作室/index.html` if needed for root serving behavior

**Step 1: Write the failing test**

- `verify-chat-api.mjs` should expect:
  - `GET /api/studio-data` returns JSON
  - `POST /api/chat` returns `503` with a missing-key message when `OPENAI_API_KEY` is unset

**Step 2: Run test to verify it fails**

Run:

```bash
node tests/verify-chat-api.mjs
```

Expected: FAIL because `server.mjs` and the endpoints do not exist yet.

**Step 3: Write minimal implementation**

- Serve static files.
- Add `GET /api/studio-data`.
- Add `POST /api/chat`.
- Use OpenAI's OpenAI-compatible Chat Completions API from the server only.

**Step 4: Run test to verify it passes**

Run:

```bash
node tests/verify-chat-api.mjs
```

Expected: PASS with the missing-key fallback contract.

### Task 4: Add the Right-Side Chat UI

**Files:**
- Modify: `/Users/jiachenwang/Desktop/ai工作室/222.html`

**Step 1: Write the failing test**

- `verify-chat-ui.mjs` should require:
  - AI sidebar container
  - starter prompt buttons
  - message list
  - input and send button

**Step 2: Run test to verify it fails**

Run:

```bash
node tests/verify-chat-ui.mjs
```

Expected: FAIL because the `Assets` view has no chat sidebar yet.

**Step 3: Write minimal implementation**

- Convert the `Assets` view to a two-column layout.
- Add chat UI and client-side fetch logic.
- Show loading and backend error states.

**Step 4: Run test to verify it passes**

Run:

```bash
node tests/verify-chat-ui.mjs
```

Expected: PASS.

### Task 5: End-to-End Verification

**Files:**
- Modify: `/Users/jiachenwang/Desktop/ai工作室/docs/working/progress.md`
- Modify: `/Users/jiachenwang/Desktop/ai工作室/docs/working/findings.md`
- Modify: `/Users/jiachenwang/Desktop/ai工作室/docs/working/task_plan.md`

**Step 1: Write the failing test**

- Existing checks are enough.

**Step 2: Run test to verify it fails**

- Not needed.

**Step 3: Write minimal implementation**

- No code change required beyond final wiring and docs updates.

**Step 4: Run test to verify it passes**

Run:

```bash
node tests/verify-222.mjs
node tests/verify-assets-media.mjs
node tests/verify-assets-layout.mjs
node tests/verify-chat-ui.mjs
node tests/verify-chat-api.mjs
```

Expected: All pass.
