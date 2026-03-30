# Unified Splash Login Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `index.html` the only real splash page, keep `开屏动画.html` as a legacy shim, and restyle the login page so it matches the splash/workspace visual language.

**Architecture:** Repoint the entry flow so `index.html` renders the particle splash directly and `开屏动画.html` only forwards legacy links. Keep the existing `splash.js` navigation handoff to `login.html`, then rebuild `login.html` and `styles/login.css` around the app's existing dark panel language instead of a standalone template aesthetic.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Node-based regression checks

---

### Task 1: Update splash regression coverage

**Files:**
- Modify: `tests/verify-splash-page.mjs`
- Modify: `tests/verify-encoded-splash-route.mjs`

**Step 1: Write the failing test**

Assert that:
- `index.html` is the real splash HTML document
- `开屏动画.html` forwards legacy links to `./index.html`
- splash navigation still targets `./login.html`

**Step 2: Run test to verify it fails**

Run: `node tests/verify-splash-page.mjs`
Expected: FAIL because `index.html` still redirects to `开屏动画.html`.

### Task 2: Repoint the real splash entry

**Files:**
- Modify: `index.html`
- Modify: `开屏动画.html`

**Step 1: Write minimal implementation**

- Copy the real splash shell into `index.html`
- Convert `开屏动画.html` into a thin redirect/compatibility shell

**Step 2: Run test to verify it passes**

Run: `node tests/verify-splash-page.mjs`
Expected: PASS

### Task 3: Redesign the login page

**Files:**
- Modify: `login.html`
- Modify: `styles/login.css`
- Modify: `scripts/login-page.js`
- Modify: `scripts/shared/auth.js`

**Step 1: Write minimal implementation**

- Keep only a centered login form
- Reuse the product's dark, restrained, lightly glassy visual language
- Preserve splash-to-login-to-workspace behavior

**Step 2: Run tests to verify they pass**

Run: `node tests/verify-login-page.mjs`
Expected: PASS

Run: `node tests/verify-login-flow.mjs`
Expected: PASS

### Task 4: Verify build and runtime behavior

**Files:**
- Modify: `sw.js`
- Modify: `scripts/build-pages.mjs` if needed

**Step 1: Run verification**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS
