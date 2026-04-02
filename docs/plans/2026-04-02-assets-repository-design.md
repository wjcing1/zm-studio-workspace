# Assets Repository Design

## Goal

Extend the new repository-backed studio data flow so `Digital Assets` no longer depends on static asset literals and instead reads grouped, searchable asset records from the same database-backed snapshot used by the rest of the app.

## Design Decision

The asset model will use **two core tables only**:

- `projects`
- `assets`

No separate `asset_groups` or `asset_metadata` tables in this phase.

## Why Two Tables

This keeps the schema aligned with the current product shape:

- projects are the primary organizing concept
- every asset belongs to zero or one project
- project grouping can be derived from `project_id`
- visual grouping inside a project can live on the asset row itself
- hidden AI/search metadata can live on the asset row without introducing early normalization overhead

This is enough for the current goal of:

- grouping assets by project in the page UI
- supporting hidden structured metadata for search and AI retrieval
- keeping the migration small enough to land on top of the current repository refactor

## Asset Table Shape

The `assets` table should continue to hold the current display fields and gain asset-specific grouping and retrieval metadata.

### Existing Fields To Preserve

- `id`
- `project_id`
- `title`
- `category`
- `format`
- `size`
- `url`
- `source_label`
- `file_url`
- `sort_order`

### New Fields To Add

- `group_name`
  - display grouping within a project such as `效果图`, `RENDERS`, `Concept`, `Presentation`
- `action_label`
  - keeps the current `Open file` vs `Open archive` behavior in data rather than hardcoding it in the page
- `is_featured`
  - allows later curation without changing grouping
- `search_text`
  - denormalized string used for lightweight search and future server-side filtering
- `meta_json`
  - JSON blob for hidden structured metadata used by AI/search only

### `meta_json` Shape

The first version should support keys like:

- `spaceType`
- `shotType`
- `viewAngle`
- `style`
- `colorMood`
- `materials`
- `keywords`
- `driveFileId`
- `driveFolderId`

These fields are intentionally hidden from the rendered page. They exist to improve future AI responses and asset search quality.

## Runtime Snapshot Contract

The runtime snapshot should stay backward-compatible at the top level:

- `studio`
- `assistant`
- `canvas`
- `projects`
- `assets`

The `assets` array remains flat in the API snapshot so the browser fallback path stays simple.

New asset fields can be added to each asset object:

- `groupName`
- `actionLabel`
- `isFeatured`
- `searchText`
- `meta`

The page will group assets client-side by:

1. `projectId`
2. `groupName`

This avoids creating a second grouped API contract while still allowing the UI to render grouped sections.

## Page Rendering Strategy

`assets-page.js` should stop treating the asset list as one anonymous grid.

Instead:

- filter the flat asset array
- partition the filtered assets by project
- render a section per project
- optionally render a subgroup label inside each project section when `groupName` exists

The page should still support:

- search
- category filters
- project deep links
- archive/file action links

Hidden metadata must not be visibly rendered on the page.

## AI/Search Strategy

The visible assets page continues to render simple cards, but repository-backed asset rows now carry hidden metadata.

That enables future retrieval by:

- project name
- asset group
- file/category/type labels
- structured tags in `meta`
- denormalized `searchText`

In this phase, the database refactor should only make the metadata available in the repository snapshot. It does not need to ship a full advanced asset search API yet.

## Migration Strategy

The current repository already seeds `assets` from `studio-data.mjs`.

This phase extends that approach:

- migration adds the new asset columns
- seed data is updated to populate them
- repository snapshot serialization returns them
- build export writes them into `dist/data/studio-data.json`

Because the browser already prefers `/api/studio-data` and falls back to the static JSON snapshot, this keeps server mode and static mode consistent.

## Guardrails

- Do not create extra asset tables in this phase
- Do not expose hidden metadata in the visible UI
- Do not break the existing top-level `/api/studio-data` snapshot shape
- Do not make the static Pages fallback depend on a live API
- Do not split assets into a separate runtime data source outside the repository

## Acceptance Criteria

- repository snapshot returns project-linked assets with `groupName` and hidden `meta`
- `/api/studio-data` exposes the same asset shape
- static export includes the enriched asset snapshot
- `assets-page.js` renders assets grouped by project from the repository-backed snapshot
- asset action labels remain data-driven
