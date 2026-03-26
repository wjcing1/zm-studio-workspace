# Project-Linked Canvas Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the project ledger into a navigation surface that opens a dedicated canvas for each project, while keeping the studio overview canvas and improving project canvas functionality.

**Architecture:** Keep the existing static single-page app, but replace the single global canvas state with a canvas registry that supports overview and per-project boards. Store initial board definitions in `studio-data.mjs`, render project metadata and SVG connections in `app.js`, and persist edits per board with `localStorage`.

**Tech Stack:** HTML, CSS, vanilla JavaScript modules, Node static server, Playwright CLI verification scripts

---

### Task 1: Add failing verification for project-canvas navigation

**Files:**
- Create: `tests/verify-project-canvas-ui.mjs`
- Create: `tests/verify-project-canvas-navigation.mjs`
- Modify: `222.html`
- Modify: `app.js`

**Step 1: Write the failing test**

Create checks for:
- canvas header markers such as `id="canvasBreadcrumb"` and `id="canvasContextMeta"`
- project rows exposing `data-project-id`
- browser flow where clicking a project row opens the canvas view and shows the selected project title

**Step 2: Run test to verify it fails**

Run: `node tests/verify-project-canvas-ui.mjs && node tests/verify-project-canvas-navigation.mjs`

Expected: FAIL because the current app has no project-linked canvas UI or navigation.

**Step 3: Write minimal implementation**

Add the missing UI hooks and navigation behavior in the app.

**Step 4: Run test to verify it passes**

Run: `node tests/verify-project-canvas-ui.mjs && node tests/verify-project-canvas-navigation.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add 222.html app.js studio-data.mjs tests/verify-project-canvas-ui.mjs tests/verify-project-canvas-navigation.mjs
git commit -m "feat: link projects to dedicated canvases"
```

### Task 2: Add board data and connection rendering

**Files:**
- Modify: `studio-data.mjs`
- Modify: `app.js`
- Modify: `222.html`

**Step 1: Write the failing test**

Extend browser verification to assert:
- project canvas renders connection lines
- project canvas shows project metadata chips
- reset view keeps working in project mode

**Step 2: Run test to verify it fails**

Run: `node tests/verify-project-canvas-navigation.mjs`

Expected: FAIL because the current canvas renderer does not support project connections or metadata.

**Step 3: Write minimal implementation**

Add per-project board definitions, SVG connection rendering, canvas header metadata, and per-board camera handling.

**Step 4: Run test to verify it passes**

Run: `node tests/verify-project-canvas-navigation.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add 222.html app.js studio-data.mjs tests/verify-project-canvas-navigation.mjs
git commit -m "feat: upgrade project canvas interactions"
```

### Task 3: Preserve existing behavior and verify full app

**Files:**
- Modify: `task_plan.md`
- Modify: `progress.md`
- Modify: `findings.md`

**Step 1: Run focused verification**

Run:
- `node tests/verify-222.mjs`
- `node tests/verify-assets-layout.mjs`
- `node tests/verify-assets-media.mjs`
- `node tests/verify-chat-ui.mjs`
- `node tests/verify-chat-api.mjs`
- `node tests/verify-project-canvas-ui.mjs`
- `node tests/verify-project-canvas-navigation.mjs`

**Step 2: Run browser sanity check**

Open `http://127.0.0.1:4173/222.html`, click a project row, confirm the matching project canvas loads, then return to overview.

**Step 3: Document results**

Update planning/progress notes with the delivered behavior and any remaining gaps.

**Step 4: Commit**

```bash
git add task_plan.md progress.md findings.md
git commit -m "docs: record project canvas delivery"
```
