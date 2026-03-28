# Realtime Collaboration and Cloud Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace browser-only board persistence with a cloud-ready, server-backed collaboration foundation that preserves the current workspace UI and board model.

**Architecture:** Keep the existing canvas renderer and board normalization logic, but move persistence ownership behind a server-side board repository and client-side adapter layer. Add collaboration config and snapshot APIs now so the app can graduate from local-only state to shared board ownership without waiting for full websocket sync.

**Tech Stack:** Vanilla JavaScript modules, Node HTTP server, JSON snapshot persistence, existing board schema helpers, browser fetch APIs, Node-based regression scripts.

---

### Task 1: Lock the collaboration API contracts with failing tests

**Files:**
- Create: `tests/verify-collaboration-config-api.mjs`
- Create: `tests/verify-board-snapshots-api.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing tests**

- Add a test for `GET /api/collaboration/config` that expects provider, mode, and feature flags.
- Add a test for board snapshot APIs that expects:
  - `GET /api/boards/overview`
  - `GET /api/boards/:projectId`
  - `PUT /api/boards/:boardId`
- Keep the tests strict about response shape and error codes.

**Step 2: Run the tests to verify they fail**

Run:
- `node tests/verify-collaboration-config-api.mjs`
- `node tests/verify-board-snapshots-api.mjs`

Expected:
- `404` or missing-response failures because the endpoints do not exist yet.

### Task 2: Add collaboration configuration and board repository foundations

**Files:**
- Create: `collaboration-config.mjs`
- Create: `board-store.mjs`
- Modify: `server.mjs`

**Step 1: Add the minimal implementation**

- Parse collaboration-related environment variables into a normalized config object.
- Add a board repository abstraction with:
  - seed fallback loading from `studio-data.mjs`
  - snapshot read
  - snapshot write
  - provider metadata
- Keep the first implementation file-based or in-memory on the server so it works without external services.

**Step 2: Verify the new modules are loadable**

Run:
- `node --input-type=module -e "import('./collaboration-config.mjs').then(() => console.log('ok'))"`
- `node --input-type=module -e "import('./board-store.mjs').then(() => console.log('ok'))"`

Expected:
- Both commands print `ok`.

### Task 3: Expose collaboration config and board snapshot APIs

**Files:**
- Modify: `server.mjs`
- Modify: `board-store.mjs`

**Step 1: Implement the HTTP handlers**

- Add `GET /api/collaboration/config`.
- Add `GET /api/boards/:boardId`.
- Add `PUT /api/boards/:boardId`.
- Validate board snapshots through the existing board sanitation helpers before persisting them.
- Return clear JSON errors for invalid payloads and unknown boards.

**Step 2: Run targeted API tests**

Run:
- `node tests/verify-collaboration-config-api.mjs`
- `node tests/verify-board-snapshots-api.mjs`

Expected:
- Both tests pass.

### Task 4: Move the client persistence path behind a cloud-ready adapter

**Files:**
- Modify: `scripts/shared/studio-data-client.js`
- Modify: `scripts/workspace-page.js`

**Step 1: Add the client adapter**

- Introduce a client-side board persistence layer that:
  - fetches collaboration config
  - loads board snapshots from the server when available
  - persists changes back to the server
  - keeps `localStorage` only as cache/fallback
- Preserve the current board registry and rendering contract.

**Step 2: Keep behavior stable**

- Do not change node rendering, selection, undo, or assistant behavior.
- Only change where board state comes from and where it is persisted.

### Task 5: Verify the workspace still works on the new persistence path

**Files:**
- Modify: `tests/run-all.mjs`
- Modify: `progress.md`

**Step 1: Run targeted checks**

Run:
- `node tests/verify-collaboration-config-api.mjs`
- `node tests/verify-board-snapshots-api.mjs`
- `node tests/verify-workspace-page.mjs`
- `node tests/verify-workspace-board-model.mjs`

Expected:
- All targeted checks pass.

**Step 2: Run broader regression coverage**

Run:
- `node tests/verify-encoded-splash-route.mjs`
- `node tests/verify-workspace-copilot-ui.mjs`
- `npm test`

Expected:
- The server boots cleanly and existing workspace regressions stay green.
