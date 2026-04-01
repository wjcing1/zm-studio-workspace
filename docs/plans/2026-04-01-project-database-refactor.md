# Project Database Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the studio app from static runtime data imports to a repository-backed database architecture using `SQLite` now, while preserving a clean path to a future `Postgres` provider.

**Architecture:** Introduce a server-side repository abstraction that owns studio data and board persistence, back it with `SQLite`, seed it from the current static dataset, and then migrate server handlers and browser pages off direct `studio-data.mjs` imports. Preserve GitHub Pages by generating a static snapshot JSON fallback at build time. Treat the current `tests/verify-login-flow.mjs` Playwright `Session closed` failure as an existing flaky baseline unless the database refactor directly changes that area.

**Tech Stack:** Vanilla JavaScript modules, Node HTTP server, `SQLite`, SQL migrations, filesystem uploads and memory stores, Playwright CLI regression scripts, Node API tests.

---

### Task 1: Lock the database contract with failing repository and API tests

**Files:**
- Create: `tests/verify-studio-repository.mjs`
- Create: `tests/verify-studio-data-api.mjs`
- Modify: `tests/verify-chat-api.mjs`
- Modify: `tests/verify-board-snapshots-api.mjs`

**Step 1: Write the failing tests**

- Add a repository-level test that initializes a temp database, runs bootstrap, and expects studio profile, projects, assets, and boards to exist.
- Add an API test for `GET /api/studio-data` that expects repository-backed data from a temp database rather than a direct static module import.
- Extend the chat API test so the response path is still exercised after the prompt context moves behind the repository.
- Extend the board snapshot API test so `GET` and `PUT` assert durable board reads and writes from the database.

**Step 2: Run the targeted tests to verify they fail**

Run:
- `node tests/verify-studio-repository.mjs`
- `node tests/verify-studio-data-api.mjs`
- `node tests/verify-chat-api.mjs`
- `node tests/verify-board-snapshots-api.mjs`

Expected:
- repository tests fail because no database bootstrap exists yet
- studio data API test fails because the endpoint is still backed by `studio-data.mjs`
- board snapshot API expectations fail because boards are still JSON-file-backed

### Task 2: Add the repository layer, migrations, and seed bootstrap

**Files:**
- Create: `data/seed/studio-seed.mjs`
- Create: `data/sql/migrations/001_initial_schema.sql`
- Create: `scripts/bootstrap-studio-db.mjs`
- Create: `studio-repository.mjs`
- Create: `sqlite-studio-repository.mjs`
- Modify: `package.json`
- Modify: `studio-data.mjs`

**Step 1: Add the SQLite provider dependency**

- Add the chosen `SQLite` package and keep the repository API provider-oriented so `Postgres` can be added later.

**Step 2: Define the initial schema**

- Create tables for studio profile, focus items, assistant profiles, assistant starters, projects, project deliverables, project team members, assets, boards, board nodes, and board edges.
- Keep ordering columns where the UI depends on stable ordering.
- Add timestamps and foreign keys where they provide clear integrity.

**Step 3: Add bootstrap and seed import**

- Move the current static dataset into a seed-only source.
- Add a bootstrap script that applies migrations and seeds the database when empty.
- Make seeding idempotent and preserve current IDs such as `PRJ-001` and board keys.

**Step 4: Run the repository tests**

Run:
- `node tests/verify-studio-repository.mjs`

Expected: the bootstrap and seed flow now pass at repository level.

### Task 3: Switch server studio-data and AI reads to the repository

**Files:**
- Modify: `server.mjs`
- Modify: `studio-repository.mjs`
- Modify: `sqlite-studio-repository.mjs`

**Step 1: Create one repository instance at server startup**

- Initialize the repository once.
- Ensure the database is bootstrapped before request handlers use it.

**Step 2: Move `GET /api/studio-data` behind the repository**

- Return the same response shape the browser expects, including studio, assistant, projects, assets, and canvas seed data.

**Step 3: Move `/api/chat` prompt context behind the repository**

- Replace direct `studioData` prompt construction with repository reads.
- Keep the existing guardrails and response shape intact.

**Step 4: Run the targeted API checks**

Run:
- `node tests/verify-studio-data-api.mjs`
- `node tests/verify-chat-api.mjs`

Expected: both pass with repository-backed reads.

### Task 4: Move board persistence from JSON files to the repository

**Files:**
- Modify: `board-store.mjs`
- Modify: `server.mjs`
- Modify: `studio-repository.mjs`
- Modify: `sqlite-studio-repository.mjs`
- Modify: `tests/verify-board-snapshots-api.mjs`

**Step 1: Replace JSON board persistence with repository-backed reads and writes**

- Keep the external `GET /api/boards/:boardId` and `PUT /api/boards/:boardId` contract stable.
- Save overview and project boards to the database.
- Return a persistence descriptor that clearly identifies database-backed storage.

**Step 2: Preserve migration behavior for existing board snapshots**

- If an older JSON board snapshot exists, import it into the database once instead of dropping it silently.
- Keep the migration path explicit and deterministic.

**Step 3: Run the targeted board checks**

Run:
- `node tests/verify-board-snapshots-api.mjs`

Expected: board API round-trips through the database and no longer depends on `.data/boards/*.json`.

### Task 5: Replace browser static imports with async runtime data loading

**Files:**
- Modify: `scripts/shared/studio-data-client.js`
- Modify: `scripts/projects-page.js`
- Modify: `scripts/assets-page.js`
- Modify: `scripts/workspace-page.js`
- Modify: `tests/verify-project-canvas-ui.mjs`
- Modify: `tests/verify-workspace-page.mjs`
- Modify: `tests/verify-chat-ui.mjs`
- Modify: `tests/verify-real-project-dataset.mjs`

**Step 1: Add async studio-data loading with cache**

- Replace synchronous exports built from `studio-data.mjs` with loader/accessor functions.
- Fetch `/api/studio-data` first.
- Add clear fallback behavior for static environments.

**Step 2: Update page bootstraps**

- Make projects, assets, and workspace wait for the data loader before first render.
- Restructure workspace board initialization so `state.boards` is created after studio data is available.

**Step 3: Update tests for the new runtime contract**

- Adjust tests that relied on direct static imports or static source markers.
- Keep project naming/data regression intent intact even if the runtime source moved.

**Step 4: Run targeted browser and page checks**

Run:
- `node tests/verify-project-canvas-ui.mjs`
- `node tests/verify-workspace-page.mjs`
- `node tests/verify-chat-ui.mjs`
- `node tests/verify-real-project-dataset.mjs`

Expected: pages still expose the expected UI and still render the same real project dataset.

### Task 6: Preserve GitHub Pages with generated static snapshot output

**Files:**
- Modify: `scripts/build-pages.mjs`
- Create: `scripts/export-studio-snapshot.mjs`
- Modify: `tests/verify-github-pages-build.mjs`
- Modify: `tests/verify-github-pages-compat.mjs`

**Step 1: Generate static studio snapshot JSON during build**

- Export a read-only studio snapshot from the seed source or repository bootstrap data into the build output.
- Ensure the output path is stable for browser fallback loading.

**Step 2: Keep static mode graceful**

- Confirm pages still render in static hosting with read-only data.
- Do not require `/api/studio-data` for GitHub Pages.

**Step 3: Run the build-related checks**

Run:
- `node tests/verify-github-pages-build.mjs`
- `node tests/verify-github-pages-compat.mjs`

Expected: build output still succeeds and includes static compatibility markers plus the new snapshot fallback.

### Task 7: Verify the refactor slice and record known baseline gaps

**Files:**
- Modify: `docs/plans/2026-04-01-project-database-refactor-design.md`
- Modify: `docs/plans/2026-04-01-project-database-refactor.md`

**Step 1: Run the targeted database and page regressions**

Run:
- `node tests/verify-studio-repository.mjs`
- `node tests/verify-studio-data-api.mjs`
- `node tests/verify-chat-api.mjs`
- `node tests/verify-board-snapshots-api.mjs`
- `node tests/verify-project-canvas-ui.mjs`
- `node tests/verify-workspace-page.mjs`
- `node tests/verify-chat-ui.mjs`
- `node tests/verify-github-pages-build.mjs`
- `node tests/verify-github-pages-compat.mjs`

Expected: all targeted checks pass.

**Step 2: Run adjacent regressions that should stay green**

Run:
- `node tests/verify-project-canvas-navigation.mjs`
- `node tests/verify-assets-project-links.mjs`
- `node tests/verify-workspace-ai-api.mjs`
- `node tests/verify-workspace-memory-store.mjs`

Expected: no regressions in navigation, project linking, workspace AI API shape, or memory persistence.

**Step 3: Record the known flaky baseline separately**

- Re-run `node tests/verify-login-flow.mjs` only as a documented non-blocking check.
- If it still fails with the same Playwright `Session closed` signature, record it as unchanged baseline noise rather than a database-refactor regression.
