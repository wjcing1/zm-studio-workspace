# Workspace Canvas Interaction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the workspace canvas so blank-area single-pointer drags create a marquee, two-finger gestures pan and zoom, the space key opens the AI panel, and edge creation reliably connects two nodes.

**Architecture:** Keep the current hand-rolled canvas state machine in `scripts/workspace-page.js`, but separate blank-canvas interactions from gesture-based camera movement. Use coordinate hit-testing instead of `event.target` for hover and edge targeting so pointer capture no longer breaks connection logic, and preserve the existing board model and persistence flow.

**Tech Stack:** Vanilla JavaScript modules, browser pointer/wheel events, Playwright CLI regression scripts, local Node test runner.

---

### Task 1: Lock the new interaction contract with regression tests

**Files:**
- Modify: `tests/verify-workspace-pan-drag.mjs`
- Create: `tests/verify-workspace-ai-shortcut.mjs`
- Create: `tests/verify-workspace-edge-connect.mjs`
- Create: `tests/verify-workspace-touch-gestures.mjs`
- Modify: `tests/run-all.mjs`

**Step 1: Write the failing tests**

- Change the blank-canvas drag regression so it expects marquee selection without camera movement.
- Add a test that presses `Space` on the workspace page and expects the AI panel to open with focus in the composer.
- Add a test that starts an edge on one node port, releases over another node, and expects a new edge path.
- Add a test that simulates two-finger pan and pinch-style zoom gestures and expects camera translation and zoom changes.

**Step 2: Run each test to verify it fails**

Run:
- `node tests/verify-workspace-pan-drag.mjs`
- `node tests/verify-workspace-ai-shortcut.mjs`
- `node tests/verify-workspace-edge-connect.mjs`
- `node tests/verify-workspace-touch-gestures.mjs`

Expected:
- Existing drag behavior still pans instead of marquee-selecting.
- `Space` does not open the AI panel yet.
- Edge creation does not complete between two nodes.
- Two-finger gesture semantics are missing or incorrect.

### Task 2: Implement the interaction-state fixes

**Files:**
- Modify: `scripts/workspace-page.js`

**Step 1: Add the minimal implementation**

- Introduce coordinate-based node hit-testing so hover and edge targeting survive pointer capture.
- Change blank-canvas single-pointer interaction to marquee select.
- Add explicit two-touch gesture tracking for touch pointers and trackpad-style wheel behavior:
  - normal two-finger scroll pans
  - pinch/`ctrl+wheel` zooms around the pointer
- Change `Space` to open the assistant panel and focus `#assistantInput`.

**Step 2: Keep persistence and undo behavior stable**

- Preserve drag, resize, edge creation, node editing, and existing persistence/undo rules.
- Only mark history when the camera or board contents actually change.

### Task 3: Verify the full workspace interaction slice

**Files:**
- Modify: `scripts/workspace-page.js`
- Modify: `tests/run-all.mjs`

**Step 1: Run targeted checks**

Run:
- `node tests/verify-workspace-pan-drag.mjs`
- `node tests/verify-workspace-ai-shortcut.mjs`
- `node tests/verify-workspace-edge-connect.mjs`
- `node tests/verify-workspace-touch-gestures.mjs`

Expected: all pass.

**Step 2: Run broader regression coverage**

Run:
- `node tests/verify-workspace-page.mjs`
- `node tests/verify-workspace-copilot-ui.mjs`
- `node tests/verify-project-canvas-ui.mjs`
- `npm test`

Expected: no workspace regressions in the wider suite.
