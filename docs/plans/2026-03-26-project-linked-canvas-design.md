# Project-Linked Canvas Design

## Goal

Bind each project record to its own canvas so the project ledger becomes a navigation layer into project-specific thinking spaces instead of a separate static table.

## Current Context

- The app has three views: `Canvas`, `Projects`, and `Assets`.
- The canvas is currently a single shared board with hard-coded demo nodes.
- The projects table renders metadata but does not navigate anywhere.
- The assets page already includes a live AI panel and must remain untouched functionally.

## Assumptions

- Keep the current single-page architecture with `222.html` + `app.js` + `studio-data.mjs`.
- Preserve the existing global canvas as a studio overview canvas.
- Clicking a project row should jump into the `Canvas` view and load that project's dedicated canvas.
- Users should be able to edit text nodes and reposition nodes, and those changes should persist locally per canvas.

## Recommended Approach

Use one canvas renderer with two modes:

1. `overview` mode for the studio-wide canvas
2. `project` mode for project-specific canvases keyed by `project.id`

Each project in `studio-data.mjs` will get a `canvas` payload containing:

- `camera`
- `nodes`
- `connections`
- `highlights`/summary metadata that can be surfaced in a canvas header

The UI will add a canvas header overlay with:

- breadcrumb/back control
- current canvas title
- project metadata chips such as location, year, and status
- quick actions like reset and "back to overview"

Connections will be rendered as an SVG layer beneath nodes so project canvases feel more spatial and less like isolated sticky notes.

## Data Flow

- `studio-data.mjs` provides initial overview canvas data and per-project canvas data.
- `app.js` manages `canvasContext` in state: current mode, active project, current camera, and current nodes.
- Clicking a row in `Projects` calls `openProjectCanvas(projectId)`.
- Rendering derives visible nodes/connections from the current canvas context.
- Local edits are saved under separate `localStorage` keys for overview and each project canvas.

## Interaction Design

- Clicking a project row opens that project's canvas and activates the `Canvas` tab.
- A back button in the canvas header returns to the studio overview canvas.
- Double-click on empty canvas creates a text node in the current canvas context.
- Dragging a node and editing text affect only the active canvas.
- Reset view resets the current canvas camera, not every canvas globally.

## Error Handling

- If a project lacks canvas data, fall back to a generated starter canvas instead of breaking navigation.
- If `localStorage` is unavailable, continue with in-memory state and keep the UI functional.

## Testing

- Static verification that the canvas view exposes project navigation markers and metadata shell.
- Browser verification that clicking a project row opens the matching project canvas.
- Browser verification that the canvas header updates and that at least one connection is visible in project mode.

