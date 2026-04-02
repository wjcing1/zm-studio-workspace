# Assets Batch Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Populate the repository-backed assets feed with a first large batch of compressed visual previews and hidden structured metadata.

**Architecture:** Reuse the approved `projects + assets` model, import previews from Google Drive into project-scoped local media folders, and expose them through the existing SQLite-backed `/api/studio-data` snapshot flow.

**Tech Stack:** Vanilla JavaScript seed data, SQLite repository, `gog` Google Drive CLI, `sips` image conversion, Node verification scripts.

---

### Task 1: Lock the richer seed-data contract

**Files:**
- Modify: `tests/verify-studio-repository.mjs`
- Modify: `tests/verify-studio-data-api.mjs`

**Step 1: Add expectations for a larger visual asset pool**

- Assert the seeded snapshot exposes at least 40 assets
- Assert the snapshot exposes the new `PRJ-005` project
- Keep the existing grouped-asset and hidden-metadata assertions

**Step 2: Run the targeted checks first**

Run:
- `node tests/verify-studio-repository.mjs`
- `node tests/verify-studio-data-api.mjs`

Expected:
- FAIL because the current seed data does not yet contain the larger asset pool or `PRJ-005`

### Task 2: Import and compress the new preview images

**Files:**
- Create: `media/assets/dubai-2026-elevator/*.jpg`
- Create: `media/assets/herb-expo/*.jpg`
- Create: `media/assets/shuyong-showroom/*.jpg`
- Create: `media/assets/mido-26-conant/*.jpg`

**Step 1: Download the selected Drive originals**

- Use `gog drive download <fileId> --out <tmp-file>` for each chosen render
- Keep imports limited to visual render assets only

**Step 2: Convert them to lightweight web previews**

- Use `sips -s format jpeg -s formatOptions 72 -Z 1400` to generate the stored preview images
- Keep naming stable and project-scoped

### Task 3: Extend the seeded project and asset library

**Files:**
- Modify: `studio-data.mjs`

**Step 1: Add the new project**

- Seed `PRJ-005` for `MIDO 26 - Conant`
- Keep project copy conservative and archive-grounded

**Step 2: Add the imported asset records**

- Point each asset at its local preview path
- Keep `fileUrl` pointing at the project archive or render folder
- Fill `searchText` and hidden `meta` with structured but conservative tags
- Replace non-visual legacy assets in the feed if needed so the page stays render-first

### Task 4: Verify repository, API, and static build output

**Files:**
- Modify: `docs/plans/2026-04-02-assets-batch-import-design.md`
- Modify: `docs/plans/2026-04-02-assets-batch-import.md`

**Step 1: Run verification**

Run:
- `node tests/verify-studio-repository.mjs`
- `node tests/verify-studio-data-api.mjs`
- `node tests/verify-assets-project-links.mjs`
- `node tests/verify-github-pages-build.mjs`

Expected:
- PASS

**Step 2: Refresh the live preview**

- Reuse the existing local server and confirm the masonry feed renders the expanded asset set
