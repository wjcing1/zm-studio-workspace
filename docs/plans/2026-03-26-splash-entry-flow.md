# Splash Entry Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone splash experience in `开屏动画.html` that plays on site entry, then transitions into `222.html` through a dedicated `splash.js` module.

**Architecture:** Keep the landing flow split into two maintainable pages: `开屏动画.html` handles the animated intro and navigation handoff, while `222.html` remains the main studio interface. `index.html` becomes a thin redirect into the splash page so the entry flow can evolve without touching the main app shell.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Node-based regression checks

---

### Task 1: Add regression coverage for the splash entry flow

**Files:**
- Create: `tests/verify-splash-page.mjs`
- Modify: none
- Test: `tests/verify-splash-page.mjs`

**Step 1: Write the failing test**

Create a regression check that asserts:
- `index.html` redirects to `./开屏动画.html`
- `开屏动画.html` is a real HTML document, not raw React source
- `开屏动画.html` exposes splash markers and loads `./splash.js`
- `splash.js` contains navigation logic targeting `./222.html`

**Step 2: Run test to verify it fails**

Run: `node tests/verify-splash-page.mjs`
Expected: FAIL because the current splash file still starts with raw React/JSX and no standalone script module exists.

### Task 2: Rebuild the splash page as a standalone HTML document

**Files:**
- Modify: `开屏动画.html`
- Test: `tests/verify-splash-page.mjs`

**Step 1: Write minimal implementation**

Replace the raw React snippet with a valid HTML document containing:
- full-screen splash shell
- canvas mount for the particle animation
- accessible enter button linking to `./222.html`
- `data-page="zm-splash"` marker
- module script tag for `./splash.js`

**Step 2: Run test to verify the HTML checks pass**

Run: `node tests/verify-splash-page.mjs`
Expected: the remaining failures should now be limited to missing or incomplete JS behavior until `splash.js` is added.

### Task 3: Move animation and navigation into `splash.js`

**Files:**
- Create: `splash.js`
- Test: `tests/verify-splash-page.mjs`

**Step 1: Write minimal implementation**

Implement:
- canvas particle intro based on the existing ZM/STUDIO concept
- resize-safe reinitialization
- delayed CTA reveal
- auto exit after playback
- click-to-skip navigation with a short fade-out

**Step 2: Run test to verify it passes**

Run: `node tests/verify-splash-page.mjs`
Expected: PASS

### Task 4: Wire the site entry to the splash page

**Files:**
- Modify: `index.html`
- Test: `tests/verify-splash-page.mjs`

**Step 1: Write minimal implementation**

Update the site root to redirect visitors to `./开屏动画.html` instead of `./222.html`.

**Step 2: Run test to verify the redirect and flow pass**

Run: `node tests/verify-splash-page.mjs`
Expected: PASS

### Task 5: Verify the overall site pages still load as standalone documents

**Files:**
- Modify: none
- Test: `tests/verify-splash-page.mjs`, `tests/verify-222.mjs`, `tests/verify-project-canvas-ui.mjs`

**Step 1: Run the verification commands**

Run: `node tests/verify-splash-page.mjs`
Expected: PASS

Run: `node tests/verify-222.mjs`
Expected: PASS

Run: `node tests/verify-project-canvas-ui.mjs`
Expected: PASS
