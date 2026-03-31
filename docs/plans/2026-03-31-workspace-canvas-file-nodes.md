# Workspace Canvas File Nodes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent `file` nodes to the workspace canvas so local image and PDF attachments can be inserted and previewed directly on the board.

**Architecture:** Keep the existing workspace canvas renderer and board persistence flow, but extend the board model with a first-class `file` node type and add a lightweight upload API that stores attachments under `.data/uploads/<board-key>/...`. Create tests first, then implement the backend upload path, front-end insertion flow, and preview rendering while preserving compatibility with older `image` nodes.

**Tech Stack:** Vanilla JavaScript modules, Node HTTP server, local filesystem persistence, CSS card styling, Playwright CLI regression scripts, Node-based API tests.

---

### Task 1: Lock the new file-node contract with failing regressions

**Files:**
- Create: `tests/verify-workspace-file-upload-api.mjs`
- Create: `tests/verify-workspace-file-node-ui.mjs`
- Modify: `tests/verify-workspace-board-model.mjs`

**Step 1: Write the failing tests**

- Add an API regression that uploads a tiny SVG file to `/api/uploads` and expects a persisted board-local URL plus metadata.
- Add a browser regression that inserts an image file through the workspace canvas and expects a new `file` node to appear and persist in board state.
- Extend the board model regression so `file` nodes survive sanitize/import/export with `fileKind` and `mimeType` intact.

**Step 2: Run the targeted tests to verify they fail**

Run:
- `node tests/verify-workspace-file-upload-api.mjs`
- `node tests/verify-workspace-file-node-ui.mjs`
- `node tests/verify-workspace-board-model.mjs`

Expected:
- the upload API test fails because `/api/uploads` does not exist yet
- the UI test fails because the canvas does not yet create `file` nodes
- the board model test fails because `file` nodes are not first-class nodes yet

### Task 2: Implement durable upload storage

**Files:**
- Modify: `server.mjs`

**Step 1: Add the upload endpoint**

- Add a raw-body upload parser with a reasonable size cap.
- Sanitize board keys and file names.
- Persist uploads under `.data/uploads/<board-key>/...`.
- Return JSON metadata that the canvas can store directly on a `file` node.

**Step 2: Keep static retrieval compatible**

- Extend MIME support for PDF and common image extensions as needed.
- Reuse the existing static file serving path so uploaded files are retrievable by URL.

### Task 3: Implement the `file` node model and rendering

**Files:**
- Modify: `scripts/shared/workspace-board.js`
- Modify: `scripts/workspace-page.js`
- Modify: `styles/workspace.css`
- Modify: `workspace.html`
- Modify: `scripts/shared/studio-data-client.js`

**Step 1: Add the node model**

- Make `file` a real supported node type.
- Normalize `file`, `mimeType`, `fileKind`, `title`, and `size`.
- Keep legacy `image` node support intact.
- Update JSON Canvas import/export to preserve `file` nodes.

**Step 2: Add insertion and preview UX**

- Add a toolbar `File` button and a hidden attachment input.
- Upload selected or dropped files, create `file` nodes near the pointer, and select them after insertion.
- Render image previews, PDF embeds, and fallback file cards.
- Ensure file action clicks do not trigger drag behavior.

### Task 4: Verify the workspace slice

**Files:**
- Modify: `server.mjs`
- Modify: `scripts/shared/workspace-board.js`
- Modify: `scripts/workspace-page.js`
- Modify: `styles/workspace.css`
- Modify: `workspace.html`
- Modify: `tests/verify-workspace-file-upload-api.mjs`
- Modify: `tests/verify-workspace-file-node-ui.mjs`
- Modify: `tests/verify-workspace-board-model.mjs`

**Step 1: Run targeted checks**

Run:
- `node tests/verify-workspace-file-upload-api.mjs`
- `node tests/verify-workspace-file-node-ui.mjs`
- `node tests/verify-workspace-board-model.mjs`

Expected: all pass.

**Step 2: Run adjacent regressions**

Run:
- `node tests/verify-workspace-text-edit.mjs`
- `node tests/verify-workspace-edge-connect.mjs`
- `node tests/verify-workspace-page.mjs`
- `node tests/verify-project-canvas-ui.mjs`
- `node tests/verify-board-snapshots-api.mjs`

Expected: no regressions in board persistence or existing workspace canvas flows.
