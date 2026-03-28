# Realtime Collaboration Live Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real realtime board synchronization and presence to the workspace using WebSocket + Yjs, while preserving the current board renderer and server-backed snapshot persistence.

**Architecture:** Keep the existing board object as the render target, but introduce a Yjs-backed collaboration adapter that mirrors board state into a shared document and uses awareness for ephemeral presence. Extend the existing Node server with a WebSocket endpoint that hosts one Yjs document per board, hydrates it from the board store, and periodically persists normalized snapshots back into the current repository abstraction.

**Tech Stack:** Node.js, `ws`, `yjs`, `y-websocket`, `y-protocols`, existing workspace board helpers, existing board snapshot API tests, Playwright-based UI verification

---

### Task 1: Lock the realtime collaboration contract with failing tests

**Files:**
- Modify: `tests/verify-collaboration-config-api.mjs`
- Create: `tests/verify-realtime-collaboration-api.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing config test**

- Extend `tests/verify-collaboration-config-api.mjs` so it expects:
  - `features.realtime === true`
  - `features.presence === true`
  - a websocket endpoint under `endpoints.realtime`

**Step 2: Run test to verify it fails**

Run: `node tests/verify-collaboration-config-api.mjs`
Expected: FAIL because the config still defaults realtime and presence to `false` and exposes no realtime endpoint.

**Step 3: Write the failing realtime sync test**

- Create `tests/verify-realtime-collaboration-api.mjs`.
- Start the local server on an isolated port and store dir.
- Use two Yjs websocket clients connected to the same board.
- Update board content from client A and assert client B receives the same document state.
- Publish awareness state from client A and assert client B sees remote presence.

**Step 4: Run test to verify it fails**

Run: `node tests/verify-realtime-collaboration-api.mjs`
Expected: FAIL because the server has no websocket collaboration endpoint.

### Task 2: Add Yjs dependencies and normalized board document helpers

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/shared/workspace-collaboration.js`

**Step 1: Install the collaboration dependencies**

Run: `npm install yjs y-websocket y-protocols ws`
Expected: `package.json` and `package-lock.json` include the new runtime packages.

**Step 2: Write the failing helper import check**

Run: `node --input-type=module -e "import('./scripts/shared/workspace-collaboration.js')"`
Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal document helpers**

- Create helpers that:
  - convert a normalized board snapshot into a Yjs document shape
  - read a Yjs document back into a board snapshot
  - compare snapshots to avoid echo loops
  - normalize awareness payloads for cursor, selection, and editing state

**Step 4: Run helper import check again**

Run: `node --input-type=module -e "import('./scripts/shared/workspace-collaboration.js')"`
Expected: PASS

### Task 3: Add server-side websocket collaboration hosting

**Files:**
- Modify: `collaboration-config.mjs`
- Modify: `server.mjs`
- Modify: `board-store.mjs`
- Test: `tests/verify-collaboration-config-api.mjs`
- Test: `tests/verify-realtime-collaboration-api.mjs`

**Step 1: Update collaboration config defaults**

- Default `realtime` and `presence` to `true`.
- Add a websocket endpoint pattern such as `/api/collaboration/ws/:boardId`.

**Step 2: Run config test**

Run: `node tests/verify-collaboration-config-api.mjs`
Expected: still FAIL because the websocket server is not wired yet.

**Step 3: Implement the websocket layer**

- Extend `server.mjs` with a `ws` server bound to the existing HTTP server upgrade flow.
- Host one Yjs doc plus awareness instance per board.
- Hydrate a board doc from `boardStore.getBoard(boardId)` on first use.
- Apply Yjs sync and awareness messages over websocket.
- Debounce persistence back to `boardStore.saveBoard(boardId, snapshot)` when a document changes.

**Step 4: Run targeted realtime tests**

Run: `node tests/verify-collaboration-config-api.mjs`
Expected: PASS

Run: `node tests/verify-realtime-collaboration-api.mjs`
Expected: PASS

### Task 4: Integrate client-side Yjs collaboration adapter

**Files:**
- Modify: `scripts/shared/studio-data-client.js`
- Modify: `scripts/workspace-page.js`
- Modify: `workspace.html`

**Step 1: Write the failing workspace wiring expectation**

- Add a small regression assertion inside an existing workspace/browser test or new targeted test that expects the page to expose presence UI containers once collaboration is enabled.

**Step 2: Run that test to verify it fails**

Run: `node tests/verify-workspace-page.mjs`
Expected: FAIL because the presence UI is not rendered yet.

**Step 3: Implement the client adapter**

- Load collaboration config once and open a `WebsocketProvider` for the active board when realtime is enabled.
- Mirror local board mutations into Yjs instead of only pushing snapshot saves.
- Subscribe to remote Yjs changes and re-apply snapshots into the active board without creating infinite loops.
- Publish local awareness state for pointer, selected node ids, and editing metadata.
- Keep current snapshot persistence as a fallback and recovery path.

**Step 4: Run the targeted workspace test**

Run: `node tests/verify-workspace-page.mjs`
Expected: PASS

### Task 5: Render presence in the workspace UI

**Files:**
- Modify: `styles/workspace.css`
- Modify: `workspace.html`
- Modify: `scripts/workspace-page.js`

**Step 1: Write the failing presence UI test**

- Add a browser verification that opens two pages on the same board and asserts:
  - remote cursor markers appear
  - remote selection outlines appear
  - remote editing badges appear while another client edits text

**Step 2: Run test to verify it fails**

Run: `node tests/verify-realtime-collaboration-ui.mjs`
Expected: FAIL because the UI overlays do not exist yet.

**Step 3: Implement minimal presence rendering**

- Add overlay layers for:
  - remote cursors with name/color
  - remote node selection highlights
  - editing badges on active nodes
- Keep the visuals lightweight and board-camera aware.

**Step 4: Run UI verification**

Run: `node tests/verify-realtime-collaboration-ui.mjs`
Expected: PASS

### Task 6: Final regression and cleanup

**Files:**
- Modify: `tests/run-all.mjs`
- Modify: optional docs or inline comments only if needed

**Step 1: Run targeted collaboration checks**

Run: `node tests/verify-collaboration-config-api.mjs`
Expected: PASS

Run: `node tests/verify-realtime-collaboration-api.mjs`
Expected: PASS

Run: `node tests/verify-realtime-collaboration-ui.mjs`
Expected: PASS

**Step 2: Run the full suite**

Run: `npm test`
Expected: PASS with the new collaboration checks included.

**Step 3: Summarize assumptions and migration path**

- Note that this slice keeps the current HTTP server and uses a Yjs websocket-compatible endpoint now.
- Note that later Hocuspocus or managed infrastructure can replace the in-process document host without changing the workspace renderer contract.
