# Workspace Canvas File Nodes Design

## Goal

Add a real `file` node workflow to the existing workspace canvas so local image and PDF attachments can be inserted, persisted on disk, and previewed directly on the board. The current hand-rolled canvas stays in place. Web pages remain a separate `link` workflow for now.

## Scope

This phase covers:

- Local file upload and persistence for workspace boards
- Canvas insertion for image and PDF attachments
- Inline preview behavior for image and PDF file nodes
- Backward compatibility with existing `image` nodes and JSON Canvas import/export

This phase does not cover:

- Rich webpage embeds or metadata fetching
- Full attachment management outside the canvas
- OCR, PDF annotation, or per-page navigation
- Replacing the existing canvas renderer

## Reference Baseline

The product direction follows the interaction model seen in Obsidian Canvas and the `obsidian-advanced-canvas` plugin:

1. local files can be added directly to the canvas
2. media nodes are spatial first-class cards, not plain links
3. image and PDF attachments preview in place, while still keeping a direct open action

We are not copying code. We are adapting the workflow to the current architecture.

## Recommended Approach

Keep the current board model and renderer, but introduce a new persisted `file` node type that sits alongside the existing legacy `image` type.

### Why Not Replace `image` Completely

- The studio seed data already contains `image` nodes.
- Existing rendering and export logic already understands that older shape.
- A compatibility bridge is safer than a full migration in the same pass.

New attachment creation will use `file` nodes. Existing `image` nodes will keep rendering normally.

## Data Model

Each `file` node should store:

- `type: "file"`
- `file`: persisted relative URL or path
- `content`: mirror of `file` for compatibility with existing helper code
- `title`: user-facing file name
- `mimeType`: normalized MIME type when known
- `fileKind`: `"image"`, `"pdf"`, or `"other"`
- `size`: byte size when known

Sizing rules:

- image files default to a media-card height close to the current image nodes
- PDF files default taller to support embedded preview
- other file types fall back to a compact file card

JSON Canvas import/export should preserve local file nodes as `type: "file"` and keep the extra metadata in custom fields.

## Upload And Storage

Uploads should go through a small Node API instead of browser-only blob URLs.

### API Contract

- `POST /api/uploads`
- Request body is raw file bytes
- Headers carry the board key, original file name, and content type
- Response returns persisted metadata and a board-local URL

### Storage Layout

Store files under a board-scoped directory inside the repo data area:

- `.data/uploads/<board-key>/<timestamp>-<safe-file-name>`

This keeps attachments durable, easy to inspect locally, and naturally grouped by board.

### Guardrails

- sanitize file names
- reject empty uploads
- cap request size to avoid runaway memory usage
- keep paths relative to the repo root so the existing static file handler can serve them safely

## Canvas UX

### Insertion Entry Points

This phase adds:

- a toolbar `File` action
- a hidden file input restricted to image and PDF files
- drag-and-drop file insertion on the canvas viewport

The first release does not require paste support. That can be layered on later.

### Preview Behavior

Image files:

- show the image directly inside the node
- keep a visible file name and open action

PDF files:

- show an embedded PDF preview in the node body
- keep an open action for full-size viewing

Other files:

- show a compact file card with metadata and open/download action

### Interaction Rules

- inserting one or more files should create selected nodes near the pointer or drop location
- inserted nodes should participate in the existing drag, edge, and selection system
- clicking an open action should not accidentally start a drag interaction

## Risks And Guardrails

- The canvas uses full rerenders, so file-node markup must be cheap and stable.
- Embedded PDF previews can be visually heavy, so the first version should stay simple and avoid extra controls.
- Upload failures must surface clearly in existing workspace status UI instead of failing silently.
- Static serving must stay path-safe; upload paths should never escape the repo root.

## Testing

- API regression: uploading a small image fixture returns persisted metadata and a retrievable URL
- Board model regression: `file` nodes survive sanitize/import/export round trips
- Browser regression: inserting a local file creates a `file` node and persists it in board state
- Adjacent regressions: existing workspace page markers, board helpers, and canvas interactions still pass
