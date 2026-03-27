# Web App Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the legacy `222.html` monolith with a named multi-page Web App structure that is easier to maintain and ready for public employee access.

**Architecture:** Split the current three-view shell into three standalone pages: `workspace.html`, `projects.html`, and `assets.html`. Move shared presentation and utility logic into shared CSS and shared JS modules, then add a minimal Web App shell with a manifest, service worker, and install registration.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript modules, Node HTTP server, Playwright-based verification scripts

---

### Task 1: Add failing regression checks for the new page map

**Files:**
- Modify: `tests/verify-splash-page.mjs`
- Modify: `tests/verify-project-canvas-ui.mjs`
- Modify: `tests/verify-project-canvas-navigation.mjs`
- Modify: `tests/verify-chat-ui.mjs`
- Modify: `tests/verify-assets-layout.mjs`
- Modify: `tests/verify-assets-media.mjs`
- Modify: `tests/verify-overview-title-removed.mjs`
- Create: `tests/verify-web-app-shell.mjs`

**Step 1: Write the failing tests**

Update the checks to expect:
- splash routing into `workspace.html`
- `workspace.html`, `projects.html`, and `assets.html` as standalone pages
- page-specific script files instead of the monolithic `app.js`
- `manifest.webmanifest` and `sw.js`

**Step 2: Run the tests to verify they fail**

Run the relevant verification commands and confirm they fail because the renamed pages and Web App assets do not exist yet.

### Task 2: Create shared Web App and layout files

**Files:**
- Create: `styles/shared.css`
- Create: `styles/splash.css`
- Create: `scripts/shared/studio-data-client.js`
- Create: `scripts/shared/register-web-app.js`
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Create: `icons/app-icon.svg`
- Modify: `server.mjs`

**Step 1: Write minimal implementation**

Add:
- shared base design tokens and navigation styling
- service worker registration helper
- manifest and icon assets
- service worker caching for the shell
- server MIME support for `.webmanifest`

**Step 2: Run the Web App shell test**

Run: `node tests/verify-web-app-shell.mjs`
Expected: PASS once the shell files exist and are wired.

### Task 3: Rename and split the main app pages

**Files:**
- Create: `workspace.html`
- Create: `projects.html`
- Create: `assets.html`
- Create: `styles/workspace.css`
- Create: `styles/projects.css`
- Create: `styles/assets.css`
- Create: `scripts/workspace-page.js`
- Create: `scripts/projects-page.js`
- Create: `scripts/assets-page.js`
- Modify: `index.html`
- Modify: `开屏动画.html`
- Modify: `splash.js`
- Modify: `222.html`

**Step 1: Write minimal implementation**

Implement:
- `workspace.html` for the canvas page
- `projects.html` for the ledger page
- `assets.html` for the assets and assistant page
- page-specific scripts that import shared helpers
- a compatibility redirect in `222.html` if needed
- splash and root routing that target `workspace.html`

**Step 2: Run renamed page tests**

Run the page verification scripts and confirm they pass against the new paths.

### Task 4: Verify the whole app from the local server

**Files:**
- Modify: `package.json`
- Create: `tests/run-all.mjs`

**Step 1: Write minimal implementation**

Add a project-level verification runner and ensure `npm run dev` plus `npm test` reflect the new structure.

**Step 2: Run verification**

Run:
- `node tests/run-all.mjs`
- browser navigation checks through the Node server

Expected: PASS
