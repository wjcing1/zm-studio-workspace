# Assets Repository Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the assets experience so it uses the existing repository-backed studio snapshot flow, while reshaping asset records around the approved two-table model: `projects` and `assets`.

**Architecture:** Keep `projects` as the project source of truth and extend `assets` so each asset can carry project linkage, grouping, action labels, search text, and hidden structured metadata. Continue serving browser pages through `/api/studio-data`, with GitHub Pages compatibility preserved by `dist/data/studio-data.json`.

**Tech Stack:** Vanilla JavaScript modules, Node HTTP server, `SQLite` repository, static snapshot export, Playwright CLI regression scripts, Node API tests.

---

### Task 1: Lock the grouped-assets contract with failing tests

**Files:**
- Modify: `tests/verify-studio-repository.mjs`
- Modify: `tests/verify-studio-data-api.mjs`
- Modify: `tests/verify-assets-project-links.mjs`

**Step 1: Add expectations for the new asset shape**

- Assert repository snapshots expose `assets` records with `projectId`, `groupName`, `actionLabel`, `searchText`, and `meta`.
- Assert `meta.keywords` exists for at least one seeded asset and remains hidden data rather than display-only copy.
- Assert asset search/grouping can rely on repository-backed project linkage rather than static page-only assumptions.

**Step 2: Run targeted tests and confirm they fail first**

Run:
- `node tests/verify-studio-repository.mjs`
- `node tests/verify-studio-data-api.mjs`
- `node tests/verify-assets-project-links.mjs`

Expected:
- repository/API tests fail because the current `assets` table and snapshot mapper do not expose grouped metadata
- assets page contract test fails because the renderer still assumes one flat grid

### Task 2: Extend the `assets` table and seed data without adding more core tables

**Files:**
- Modify: `data/sql/migrations/001_initial_schema.sql`
- Modify: `sqlite-studio-repository.mjs`
- Modify: `studio-data.mjs`

**Step 1: Extend the schema**

- Add `group_name`, `action_label`, `is_featured`, `search_text`, and `meta_json` columns to `assets`.
- Keep the core storage model at two domain tables only: `projects` and `assets`.

**Step 2: Update seed/bootstrap handling**

- Seed richer asset rows from `studio-data.mjs`.
- Preserve project ordering and asset ordering.
- Keep `meta_json` flexible enough for hidden tags such as `spaceType`, `shotType`, `viewAngle`, `style`, `colorMood`, `materials`, and `keywords`.

**Step 3: Update snapshot mapping**

- Return each asset with `groupName`, `actionLabel`, `isFeatured`, `searchText`, and `meta`.
- Keep the top-level snapshot shape stable so existing page bootstraps still work.

### Task 3: Rebuild the assets page around repository-backed project grouping

**Files:**
- Modify: `assets.html`
- Modify: `scripts/assets-page.js`
- Modify: `styles/assets.css`

**Step 1: Keep the page runtime contract**

- Continue loading data through `scripts/shared/studio-data-client.js`.
- Do not reintroduce direct browser imports from `studio-data.mjs`.

**Step 2: Render grouped sections**

- Group filtered assets by `projectId`, then by `groupName`.
- Keep the page visually focused on render/archive previews.
- Preserve project and archive actions on each asset card.

**Step 3: Use hidden tags for search only**

- Allow asset search to match `searchText` and metadata-derived terms.
- Do not surface the hidden metadata as visible UI chips in this pass.

### Task 4: Verify repository, API, build, and page behavior

**Files:**
- Modify: `docs/plans/2026-04-02-assets-repository-design.md`
- Modify: `docs/plans/2026-04-02-assets-repository.md`

**Step 1: Run targeted checks**

Run:
- `node tests/verify-studio-repository.mjs`
- `node tests/verify-studio-data-api.mjs`
- `node tests/verify-assets-project-links.mjs`
- `node tests/verify-github-pages-build.mjs`
- `node tests/verify-assets-layout.mjs`
- `node tests/verify-assets-media.mjs`

Expected:
- repository/API checks confirm grouped asset fields and hidden metadata survive the snapshot flow
- static build still exports `dist/data/studio-data.json`
- asset page layout and media loading stay healthy after the grouped rendering change

**Step 2: Record any deliberate follow-up**

- Note that large-scale Drive ingestion of 40-50 assets is a separate content-population pass on top of this data model.
