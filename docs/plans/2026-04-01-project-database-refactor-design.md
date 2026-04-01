# Project Database Refactor Design

## Goal

Refactor the studio app so runtime project data, asset data, AI data context, and canvas board persistence come from a database-backed repository instead of direct imports from `studio-data.mjs`. The first production provider will be local `SQLite`, but the runtime boundaries should be shaped so a future `Postgres` provider can replace it without rewriting the pages again.

## Scope

This phase covers:

- A repository abstraction for studio domain data and board persistence
- A `SQLite` provider as the default server-side runtime store
- One-time bootstrap and seed import from the current static dataset
- Server endpoints and AI prompts reading from the repository instead of `studio-data.mjs`
- Browser data loading moving from direct module import to runtime fetch with static fallback
- Workspace board reads and writes moving from JSON files to the repository
- GitHub Pages compatibility through generated static snapshot files

This phase does not cover:

- Moving uploads into the database as blobs
- Moving workspace long-term memory into SQL
- Replacing the current auth approach
- New project editing UI or AI write-back flows
- Multi-user cloud sync semantics beyond the current board API contract

## Current Baseline

Today the app uses three different persistence patterns:

1. `studio-data.mjs` is the runtime source of truth for `studio`, `projects`, `assets`, assistant copy, and canvas seed data.
2. `board-store.mjs` persists board snapshots as JSON files under `.data/boards`.
3. `memory-store.mjs` and uploads remain file-based.

This means the same domain model is split awkwardly:

- the browser imports `studio-data.mjs` directly through `scripts/shared/studio-data-client.js`
- the server imports `studio-data.mjs` for `/api/studio-data` and `/api/chat`
- the board API seeds boards from `studioData`, but mutable board state lives outside that file in `.data/boards`

The result is that "database" language appears in the UI, but the runtime is still a static module plus JSON sidecars.

## Baseline Constraint

In this worktree, the current baseline test run is not fully green before any database changes:

- `npm test` fails in `tests/verify-login-flow.mjs`
- the observed failure is a Playwright `Session closed` error while opening the workspace page

This is treated as an existing flaky baseline for this refactor. New verification must focus on targeted database and data-loading regressions plus adjacent unaffected slices.

## Recommended Approach

Introduce one runtime repository boundary for studio data and boards, then implement it with `SQLite` now and keep the contract narrow enough for a future `Postgres` provider.

### Repository Boundary

Add a server-side repository module with methods shaped around application use cases instead of raw SQL:

- `getStudioSnapshot()`
- `listProjects()`
- `listAssets()`
- `getProject(projectId)`
- `getBoard(boardKey)`
- `saveBoard(boardKey, payload)`
- `ensureInitialized()`

This keeps the pages, AI handlers, and board endpoints unaware of the storage provider.

### Why This Boundary

- The browser should never know whether data came from `SQLite`, `Postgres`, or a fallback JSON snapshot.
- The AI endpoints need structured domain data, not direct knowledge of SQL tables.
- Board persistence and board seed lookup should stop being separate concepts at runtime.
- Future cloud migration should mostly mean adding a new provider, not rewriting page scripts.

## Data Model

Use a normalized relational schema for the studio domain, but keep an escape hatch for node- and edge-type-specific metadata.

### Core Tables

- `studio_profile`
  - one row for studio name, base, description
- `studio_focus_items`
  - ordered focus bullets
- `assistant_profiles`
  - assistant scope such as `global`, `projects`, `assets`, `workspace`
  - greeting/copy for each scope
- `assistant_starters`
  - ordered starter prompts per assistant scope
- `projects`
  - `id`, `name`, `client`, `budget`, `status`, `manager`, `year`, `location`, `summary`, `website`, `sort_order`
- `project_deliverables`
  - ordered deliverables per project
- `project_team_members`
  - ordered team members per project
- `assets`
  - `id`, `project_id`, `title`, `category`, `format`, `size`, `url`, `source_label`, `file_url`, `sort_order`
- `boards`
  - `key`, `project_id`, `kind`, `title`, `description`, `camera_x`, `camera_y`, `camera_z`, timestamps
- `board_nodes`
  - `board_key`, `node_id`, node frame columns, shared text columns, `extra_json`
- `board_edges`
  - `board_key`, `edge_id`, `from_node_id`, `to_node_id`, optional text fields, `extra_json`

### Why Not Store Whole Boards As One JSON Blob

We still want:

- direct relational lookup by project and board
- easier migration to `Postgres`
- simpler future filtering and analytics on project status, year, and assets

At the same time, node schemas vary. `extra_json` on nodes and edges preserves forward compatibility without flattening every possible field upfront.

## Seed Strategy

The existing `studio-data.mjs` should stop being a runtime dependency, but it remains useful as a seed fixture during the migration.

### Seed Rules

- Move the current static dataset into a seed-only module or import path that is not used by browser runtime code.
- On first run, apply migrations and seed the database if the domain tables are empty.
- Make seeding idempotent: reruns should not duplicate rows.
- Preserve the current identifiers such as `PRJ-001` and board keys so routes and tests stay stable.

### Why Keep A Seed Fixture

- local development still needs a known starting dataset
- GitHub Pages static export still needs a read-only snapshot source
- the initial migration should not require manual data entry

## Static GitHub Pages Compatibility

The current app has a static export path, so a pure server-only database read would break GitHub Pages.

### Required Fallback

Generate a static snapshot JSON file during build, for example:

- `dist/data/studio-data.json`

The browser data loader should use this order:

1. fetch `/api/studio-data`
2. if unavailable, fetch `./data/studio-data.json`
3. if both fail, surface a clear error state

This keeps local/server mode database-backed while preserving read-only static hosting.

## Frontend Runtime Changes

`scripts/shared/studio-data-client.js` currently exports synchronous constants from `studio-data.mjs`. That must become an async runtime loader with cached accessors.

### New Client Contract

- `loadStudioData()`
- `getStudioData()`
- `getProjects()`
- `getAssets()`
- `getProjectIndex()`
- `getFilters()`
- `createBoardRegistry(studioSnapshot)`

Each page script should await initialization before its first render.

### Page-Level Impact

- `projects-page.js` loads studio data, then renders the table
- `assets-page.js` loads studio data, then renders assets and assistant starters
- `workspace-page.js` loads studio data before building `state.boards`

This is the biggest browser-side refactor in the pass and should be handled deliberately.

## Server Runtime Changes

`server.mjs` should create one repository instance at startup and pass all reads through it.

### Endpoints Affected

- `GET /api/studio-data`
  - read from repository
- `POST /api/chat`
  - build the AI prompt from repository data
- `GET /api/boards/:boardId`
  - read the board from repository
- `PUT /api/boards/:boardId`
  - save the board through repository

Uploads and memory can remain file-backed for now, but they should not depend on `studio-data.mjs`.

## Board Persistence Strategy

The runtime should stop splitting board seed data and board saved snapshots across different stores.

### New Rule

Boards live in the database from the start:

- the overview board becomes a real `boards` row
- each project board becomes a real `boards` row keyed by the existing project id
- board nodes and edges are stored in relational tables
- `saveBoard()` updates the same board data instead of writing JSON files under `.data/boards`

This keeps canvas state, board metadata, and project linkage in one storage system.

### What Stays File-Based

- uploads under `.data/uploads`
- workspace long-term memory under `.data/memory`

Those are document/blob stores and can move later without blocking the core project-library refactor.

## Migration Path

Use an incremental migration that keeps the app running at each stage.

### Phase 1

- add repository interface, SQLite provider, migrations, and seeding
- keep current browser runtime unchanged
- switch server `/api/studio-data` and `/api/chat` to repository reads

### Phase 2

- switch board API from JSON files to repository-backed board reads and writes
- migrate existing `.data/boards` snapshots into SQLite when present

### Phase 3

- replace browser direct imports with async runtime loading
- generate static snapshot JSON during build
- remove runtime browser dependence on `studio-data.mjs`

This order avoids breaking every page at once.

## Risks And Guardrails

- `SQLite` dependency choice must be stable on the target Node/runtime environment.
- Browser bootstrap becomes async, so first-render sequencing must be explicit.
- Workspace page state currently initializes synchronously and will need restructuring.
- Static export must not regress even though runtime data is becoming server-backed.
- Existing local board JSON snapshots should not be silently lost; import-or-migrate behavior needs to be explicit.

## Testing Strategy

The refactor needs both provider-level and browser-level regression coverage.

### New Or Expanded Checks

- repository initialization and seed import tests
- `/api/studio-data` returns repository-backed data
- `/api/boards/:boardId` round-trips through the database
- `/api/chat` still works from repository-loaded project and asset data
- projects/assets/workspace pages still render from async-loaded data
- build output contains a static studio snapshot for GitHub Pages fallback

### Verification Notes

- targeted database tests should be the new source of truth
- adjacent page regressions should still run
- `tests/verify-login-flow.mjs` remains a known flaky baseline until separately stabilized
