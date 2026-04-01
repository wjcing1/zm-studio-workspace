# Three-Agent Assistant Shell Design

## Goal

Unify the AI panel experience across `projects.html`, `assets.html`, and `workspace.html` so all three pages use the same floating trigger, GPT-style assistant sheet, keyboard shortcut, starter-prompt behavior, and streaming chat presentation, while still preserving three different agent identities and capability boundaries.

## Product Direction

- Keep the current `Projects` assistant shell as the visual and interaction reference.
- Treat Projects, Assets, and Workspace as three distinct agents, not one generic assistant with a different heading.
- Share the presentation layer and shell state machine.
- Keep each page's data context, backend route, and agent-specific capabilities separate.
- Preserve the Workspace agent's canvas-aware behavior and structured operation support.

## Scope

This phase covers:

- Shared floating assistant trigger and sheet layout across all three pages
- Shared message rendering, starter collapsing, scrolling, and close/open behavior
- Shared streaming text experience for Projects and Assets
- Assets migration from the old static sidebar chat to the shared assistant shell
- Workspace migration from its current bespoke panel styling to the shared assistant shell
- Workspace assistant text streaming while preserving final structured operations

This phase does not cover:

- Merging the three agents into one backend endpoint
- Changing project, asset, or board data models
- Adding new AI write-back behavior beyond current Workspace operations
- Replacing the current agent prompts with entirely new product behavior

## Current Baseline

The app currently has three different assistant surfaces:

1. `projects.html`
   - already uses the new floating-dot trigger
   - already uses the GPT-style sheet layout
   - already streams replies from `/api/chat`
2. `assets.html`
   - still uses a fixed sidebar panel inside the page layout
   - still waits for a full JSON reply before rendering
   - has no floating trigger and no space-to-open interaction
3. `workspace.html`
   - already has a floating trigger and a dedicated panel
   - still uses its older internal layout and non-streaming request flow
   - depends on `/api/workspace-assistant` and may return `operations`

There is also an existing flaky baseline issue in this branch family:

- `tests/verify-workspace-ai-shortcut.mjs` can fail intermittently even before the new shell unification work is applied

This should be treated as baseline instability unless the new work clearly changes the shortcut contract.

## Core Product Model

These are three different agents sharing one shell.

### Projects Agent

- Persona: project manager and portfolio strategist
- Strengths: project summary, filtering suggestions, priorities, case-study picks
- Data context: project library and portfolio metadata
- Transport: `/api/chat` with project-specific agent scope

### Assets Agent

- Persona: asset librarian and portfolio archivist
- Strengths: locating assets, matching assets to projects, answering delivery/source questions
- Data context: asset library plus related project metadata
- Transport: `/api/chat` with asset-specific agent scope

### Workspace Agent

- Persona: canvas copilot
- Strengths: understanding nearby/selected canvas context and optionally applying board operations
- Data context: active board, nearby nodes, selection, visible graph context
- Transport: `/api/workspace-assistant`

## Shared Shell Architecture

Introduce one reusable assistant shell layer with two parts:

### Shared CSS

Create a single stylesheet for the shared shell, for example `styles/assistant-shell.css`, containing:

- floating dot trigger
- GPT-style panel shell
- header/body/footer layout
- starter-region transitions
- timeline and composer styling
- message bubble styling
- streaming cursor styling
- common responsive behavior

Page-specific styles stay only where a page truly needs special positioning or content-specific tweaks.

### Shared JavaScript

Create a shared assistant-shell helper, for example `scripts/shared/assistant-shell.js`, responsible for:

- open/close state
- floating trigger wiring
- `Space` open and `Escape` close
- starter visibility state
- message rendering
- pending/streaming message updates
- timeline auto-scroll
- status line updates
- generic SSE parsing for streamed text responses

The shared shell should accept a page-level adapter instead of knowing page specifics.

## Page Adapter Contract

Each page provides a thin adapter object to the shared shell.

### Required Adapter Fields

- `agentId`
- `title`
- `kicker`
- `description`
- `greeting`
- `starters`
- `sendMessage(content, shellApi)`

### Optional Adapter Hooks

- `getContextCopy()`
  - for dynamic summary text like Workspace context
- `handleChunk(delta)`
  - when a page needs custom side effects during streaming
- `handleDone(payload)`
  - for final event handling such as Workspace operations
- `onOpen()`
  - for context refresh before showing the sheet

This contract keeps the shell generic while preserving page-specific intelligence.

## Backend Contract

### `/api/chat`

Keep `/api/chat` as the shared text-chat route, but explicitly support an agent scope.

Expected request shape:

- `agent: "projects" | "assets"`
- `stream: true | false`
- `messages: [...]`

This allows Projects and Assets to share the same transport while using different prompts and data emphasis.

### `/api/workspace-assistant`

Keep this route separate because the Workspace agent still needs to return `operations`.

Upgrade it to a streaming contract shaped like:

- zero or more text chunk events
- one final done event containing:
  - final assistant text if needed
  - normalized `operations`

This keeps the Workspace experience visually aligned with the other two pages without flattening away its structured capabilities.

## Streaming Model

The shared shell should render all three agents with the same user-facing streaming rhythm:

- user bubble appears immediately
- assistant bubble appears immediately
- assistant text grows incrementally
- starter region collapses on first send
- partial content survives mid-stream errors

For Projects and Assets, the stream carries text only.

For Workspace, the stream carries text first and ends with one payload event that can still apply validated board operations.

## Testing Strategy

### Shared Shell Tests

- verify the shared shell stylesheet and helper exist
- verify pages load the shared shell assets
- verify common markers such as trigger, panel, starters region, timeline, and footer exist on all three pages

### Assets Tests

- verify floating trigger and `Space` shortcut
- verify stream-mode rendering and starter collapse
- verify old sidebar assumptions are removed

### Workspace Tests

- verify the panel uses the shared shell structure
- verify the floating trigger and shortcut still work
- verify workspace-specific context summary still appears
- verify `/api/workspace-assistant` can stream text and still return final operations
- verify operations still apply to the board after the streamed response completes

### Regression Coverage

- re-run the existing Projects AI shell regressions
- re-run API contract tests for `/api/chat` and `/api/workspace-assistant`
- re-run build and cache-refresh checks because page assets and shell styles will move

## Non-Goals

- One unified "super assistant" prompt spanning all pages
- Removing the dedicated Workspace assistant endpoint
- Adding new database tables or auth changes
- Replacing the existing Workspace board operation model
