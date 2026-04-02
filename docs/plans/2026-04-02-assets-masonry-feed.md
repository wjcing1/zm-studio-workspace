# Assets Masonry Feed Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the assets page into a continuous Xiaohongshu/Pinterest-style masonry feed while preserving repository-backed search, project linkage, and hidden metadata.

**Architecture:** Keep the current repository/API/static-fallback asset contract unchanged, and refactor only the browser rendering layer from grouped project sections to a single `asset-feed` rendered from filtered assets in stable order. Use CSS columns for masonry behavior instead of introducing JavaScript layout measurement.

**Tech Stack:** Vanilla JavaScript modules, repository-backed `/api/studio-data`, static JSON fallback, CSS columns masonry layout, Node source-contract tests.

---

### Task 1: Lock the masonry-feed contract with failing tests

**Files:**
- Modify: `tests/verify-assets-project-links.mjs`

**Step 1: Write the failing test**

- Assert the page script uses a continuous feed marker such as `asset-feed`.
- Assert the page script no longer depends on `asset-project-section`.
- Assert the styles define masonry feed behavior using CSS column rules.
- Keep assertions that hidden-search behavior and project/archive actions remain present.

**Step 2: Run the test to verify it fails**

Run:
- `node tests/verify-assets-project-links.mjs`

Expected:
- FAIL because the current renderer still outputs project sections and the CSS still uses grid blocks

### Task 2: Refactor the renderer from project sections to one feed

**Files:**
- Modify: `scripts/assets-page.js`

**Step 1: Write the minimal implementation**

- Replace sectioned rendering with a single `renderAssetFeed(results)` path
- Preserve stable ordering based on the existing `assetsDatabase`
- Keep card-level project pills and action buttons
- Keep hidden metadata search matching intact

**Step 2: Run the contract test**

Run:
- `node tests/verify-assets-project-links.mjs`

Expected:
- Still FAIL until the CSS feed contract is added

### Task 3: Introduce masonry-feed styling

**Files:**
- Modify: `styles/assets.css`

**Step 1: Write the minimal implementation**

- Add `asset-feed` column rules for desktop and mobile breakpoints
- Convert cards to `inline-block` feed items with bottom spacing
- Remove section-only styling that no longer applies
- Keep card overlays legible and compact for feed browsing

**Step 2: Re-run the contract test**

Run:
- `node tests/verify-assets-project-links.mjs`

Expected:
- PASS

### Task 4: Verify the repository-backed page still behaves correctly

**Files:**
- Modify: `tests/verify-assets-layout.mjs`
- Modify: `tests/verify-assets-media.mjs`

**Step 1: Keep targeted verification runnable**

- Continue supporting a custom assets page URL via `ASSETS_TEST_PAGE_URL`
- Re-run the repository/API/build checks that should remain green

**Step 2: Run verification**

Run:
- `node tests/verify-studio-repository.mjs`
- `node tests/verify-studio-data-api.mjs`
- `node tests/verify-assets-project-links.mjs`
- `node tests/verify-github-pages-build.mjs`

Expected:
- PASS

**Step 3: Run live page checks if the Playwright launcher is available**

Run:
- `ASSETS_TEST_PAGE_URL='http://127.0.0.1:<port>/assets.html?codex-test-auth=1' node tests/verify-assets-layout.mjs`
- `ASSETS_TEST_PAGE_URL='http://127.0.0.1:<port>/assets.html?codex-test-auth=1' node tests/verify-assets-media.mjs`

Expected:
- PASS when the Playwright environment is healthy
- If the launcher is still SIGKILLed before open, record that as an environment blocker rather than a page-regression failure
