# Workspace Canvas Copilot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the existing workspace canvas with Obsidian-style editing primitives and an AI copilot that can read nearby context and directly modify the active board.

**Architecture:** Keep the existing `workspace.html` shell and visual style, but refactor board handling around a richer node/edge model, add client-side interaction state for selection and editing, and introduce a dedicated server endpoint that returns structured canvas operations. The client remains the source of truth for rendering, history, and persistence; the server only produces validated AI suggestions and operations.

**Tech Stack:** Static HTML, vanilla JavaScript modules, CSS, Node HTTP server, OpenAI-compatible MiniMax API, Node-based verification scripts

---

### Task 1: Lock the board model in tests

**Files:**
- Create: `tests/verify-workspace-board-model.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing test**

Create a board-model regression that expects:
- old `connections` arrays to upgrade into `edges`
- board persistence payloads to include `edges`
- JSON Canvas export/import helpers to exist
- nearby-node ranking helpers to exist

**Step 2: Run test to verify it fails**

Run: `node tests/verify-workspace-board-model.mjs`
Expected: FAIL because the current board helper only supports `connections` and does not expose the new helpers.

**Step 3: Write minimal implementation**

No implementation in this task.

**Step 4: Run test to verify it still fails for the expected reasons**

Run: `node tests/verify-workspace-board-model.mjs`
Expected: FAIL with missing board-helper capability messages.

### Task 2: Lock the workspace UI markers in tests

**Files:**
- Create: `tests/verify-workspace-copilot-ui.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing test**

Create a UI regression that expects:
- a workspace action toolbar
- an assistant companion shell
- an assistant panel shell
- a marquee selection layer
- a JSON import control

**Step 2: Run test to verify it fails**

Run: `node tests/verify-workspace-copilot-ui.mjs`
Expected: FAIL because the current workspace page does not expose those markers.

**Step 3: Write minimal implementation**

No implementation in this task.

**Step 4: Run test to verify it still fails for the expected reasons**

Run: `node tests/verify-workspace-copilot-ui.mjs`
Expected: FAIL with missing workspace copilot marker messages.

### Task 3: Lock the workspace AI API contract in tests

**Files:**
- Create: `tests/verify-workspace-ai-api.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing test**

Create an API contract test that expects:
- `POST /api/workspace-assistant` to return `503` without `MINIMAX_API_KEY`
- the error payload to mention `MINIMAX_API_KEY`

**Step 2: Run test to verify it fails**

Run: `node tests/verify-workspace-ai-api.mjs`
Expected: FAIL because the endpoint does not exist yet.

**Step 3: Write minimal implementation**

No implementation in this task.

**Step 4: Run test to verify it still fails for the expected reasons**

Run: `node tests/verify-workspace-ai-api.mjs`
Expected: FAIL with a 404 or missing-endpoint failure.

### Task 4: Implement the board model upgrade

**Files:**
- Modify: `scripts/shared/studio-data-client.js`
- Create: `scripts/shared/workspace-board.js`
- Test: `tests/verify-workspace-board-model.mjs`

**Step 1: Write the failing test**

Use the failing regression from Task 1 as the guardrail.

**Step 2: Run test to verify it fails**

Run: `node tests/verify-workspace-board-model.mjs`
Expected: FAIL before helper changes are applied.

**Step 3: Write minimal implementation**

Implement:
- board edge migration
- board snapshot helpers
- JSON Canvas export/import helpers
- nearby-node ranking helpers
- board operation helpers used by the workspace page

**Step 4: Run test to verify it passes**

Run: `node tests/verify-workspace-board-model.mjs`
Expected: PASS

### Task 5: Implement the upgraded workspace editor UI

**Files:**
- Modify: `workspace.html`
- Modify: `styles/workspace.css`
- Modify: `scripts/workspace-page.js`
- Test: `tests/verify-workspace-copilot-ui.mjs`
- Test: `tests/verify-project-canvas-ui.mjs`
- Test: `tests/verify-project-canvas-navigation.mjs`

**Step 1: Write the failing test**

Use the failing regression from Task 2 as the guardrail.

**Step 2: Run test to verify it fails**

Run: `node tests/verify-workspace-copilot-ui.mjs`
Expected: FAIL before workspace UI changes are applied.

**Step 3: Write minimal implementation**

Implement:
- action toolbar
- marquee selection layer
- node multi-select behavior
- resize handles
- edge creation and deletion
- link/group node rendering
- assistant companion anchor and expandable assistant panel
- import/export controls
- keyboard shortcuts and undo/redo

**Step 4: Run test to verify it passes**

Run: `node tests/verify-workspace-copilot-ui.mjs`
Expected: PASS

### Task 6: Implement the workspace AI endpoint and client integration

**Files:**
- Modify: `server.mjs`
- Modify: `scripts/workspace-page.js`
- Test: `tests/verify-workspace-ai-api.mjs`

**Step 1: Write the failing test**

Use the failing regression from Task 3 as the guardrail.

**Step 2: Run test to verify it fails**

Run: `node tests/verify-workspace-ai-api.mjs`
Expected: FAIL before the endpoint exists.

**Step 3: Write minimal implementation**

Implement:
- `POST /api/workspace-assistant`
- structured workspace prompt
- JSON payload parsing for AI operations
- client request flow
- operation application and chat update flow

**Step 4: Run test to verify it passes**

Run: `node tests/verify-workspace-ai-api.mjs`
Expected: PASS

### Task 7: Run final verification

**Files:**
- Modify: `workspace.html`
- Modify: `styles/workspace.css`
- Modify: `scripts/workspace-page.js`
- Modify: `scripts/shared/studio-data-client.js`
- Create: `scripts/shared/workspace-board.js`
- Modify: `server.mjs`
- Create: `tests/verify-workspace-board-model.mjs`
- Create: `tests/verify-workspace-copilot-ui.mjs`
- Create: `tests/verify-workspace-ai-api.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Run targeted verification**

Run: `node tests/verify-workspace-board-model.mjs && node tests/verify-workspace-copilot-ui.mjs && node tests/verify-workspace-ai-api.mjs`
Expected: PASS

**Step 2: Run regression coverage**

Run: `node tests/run-all.mjs`
Expected: PASS

**Step 3: Review diff**

Run: `git diff -- workspace.html styles/workspace.css scripts/workspace-page.js scripts/shared/studio-data-client.js scripts/shared/workspace-board.js server.mjs tests/verify-workspace-board-model.mjs tests/verify-workspace-copilot-ui.mjs tests/verify-workspace-ai-api.mjs tests/run-all.mjs docs/plans/2026-03-27-workspace-canvas-copilot-design.md docs/plans/2026-03-27-workspace-canvas-copilot.md`
Expected: Diff shows the approved workspace copilot and editor enhancement only.
