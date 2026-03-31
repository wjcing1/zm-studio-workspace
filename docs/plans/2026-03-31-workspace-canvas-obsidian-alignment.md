# Workspace Canvas Obsidian Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the workspace canvas behave more like Obsidian Canvas for text-note creation and edge discovery, so new text cards open directly into editing and connection handles are easier to use.

**Architecture:** Keep the existing single-file interaction state machine in `scripts/workspace-page.js`, but tighten the interaction contract around text-note creation and edge discovery. Add browser regressions first, then implement focused changes for post-create editor focus, hover-driven port visibility, and smarter edge target-side selection without changing the board model.

**Tech Stack:** Vanilla JavaScript modules, browser pointer/focus events, CSS state styling, Playwright CLI regression scripts, local Node test runner.

---

### Task 1: Lock the new creation and connection behavior with regressions

**Files:**
- Modify: `tests/verify-workspace-text-edit.mjs`
- Modify: `tests/verify-workspace-edge-connect.mjs`

**Step 1: Write the failing test**

- Extend the text editing regression so it double-clicks empty canvas space, verifies that a new text node is created, and asserts that the new node's textarea receives focus automatically.
- Extend the edge regression so it verifies that hovering a node reveals connection handles before starting a drag, then confirms a new edge is created.

**Step 2: Run the targeted tests to verify they fail**

Run:
- `node tests/verify-workspace-text-edit.mjs`
- `node tests/verify-workspace-edge-connect.mjs`

Expected:
- The text test fails because new text nodes are selected but not focused for typing.
- The edge test fails because hover does not expose connection handles yet.

### Task 2: Implement the minimal interaction fixes

**Files:**
- Modify: `scripts/workspace-page.js`
- Modify: `styles/workspace.css`

**Step 1: Add the minimal behavior changes**

- Add a helper that focuses the editor for newly created text nodes after render and selects the placeholder copy so typing can replace it immediately.
- Update hover handling so node hover state triggers a render only when needed and avoids interrupting active text editing.
- Improve edge drafting so the target side is chosen from the relative position of the target node instead of a fixed inverse of the source side.

**Step 2: Keep the rest of the interaction model stable**

- Preserve current drag, marquee, resize, undo, and persistence rules.
- Avoid introducing extra rerenders while typing inside existing text, link, or group fields.

### Task 3: Verify the workspace slice

**Files:**
- Modify: `scripts/workspace-page.js`
- Modify: `styles/workspace.css`
- Modify: `tests/verify-workspace-text-edit.mjs`
- Modify: `tests/verify-workspace-edge-connect.mjs`

**Step 1: Run targeted checks**

Run:
- `node tests/verify-workspace-text-edit.mjs`
- `node tests/verify-workspace-edge-connect.mjs`

Expected: both pass.

**Step 2: Run broader workspace regressions**

Run:
- `node tests/verify-workspace-pan-drag.mjs`
- `node tests/verify-workspace-page.mjs`
- `node tests/verify-project-canvas-ui.mjs`
- `node tests/verify-realtime-collaboration-ui.mjs`

Expected: no regressions in adjacent workspace behavior.
