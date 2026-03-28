# Workspace Canvas Copilot Design

## Goal
Upgrade the existing `workspace.html` infinite canvas into a more complete Obsidian Canvas-style editor while preserving the current visual style, and add an AI copilot that understands the active board, follows the mouse, prioritizes nearby nodes, and can directly modify the canvas.

## Product Direction
- Keep the current black glass, low-noise visual language.
- Expand the editor rather than replacing it with a different canvas engine.
- Use Obsidian Canvas interaction ideas as the reference model for completeness.
- Use JSON Canvas as the interoperability target for nodes and edges.
- Let AI act directly on the board, but always keep local undo/redo available.

## Source Alignment
- Obsidian Canvas emphasizes cards, edges, groups, spatial navigation, and composition workflows.
- JSON Canvas 1.0 defines `nodes` and `edges` as the core interoperable canvas structure.
- This design is intentionally not a 1:1 UI clone of Obsidian. It preserves the current workspace page styling and upgrades the editor/data model under that shell.

## User Experience

### Editing
- Users can click to select a node.
- Users can shift-click to add/remove nodes from the selection.
- Users can drag on empty space to marquee-select nodes.
- Users can hold `Space` and drag to pan the canvas.
- Users can drag selected nodes together.
- Users can resize nodes with corner handles.
- Users can start an edge from a node port and connect it to another node.
- Users can click an edge to select it and delete it.
- Users can duplicate or delete the current selection with keyboard shortcuts.
- Users can create text, link, and group nodes from lightweight toolbar actions.

### AI Collaboration
- A compact AI companion follows the mouse with a small offset so it feels attached to the active thinking area instead of detached in a fixed sidebar.
- The companion can expand into a larger assistant panel for longer back-and-forth conversations.
- Every AI request includes ranked context:
  - mouse-nearby nodes
  - hovered node
  - selected nodes
  - directly connected neighbor nodes
  - visible viewport nodes
  - board metadata
- The assistant can:
  - create nodes
  - update node content, size, color, and position
  - create and remove edges
  - create groups around related nodes
  - tidy or relayout selected or nearby content
  - generate idea structures from a prompt
- The assistant returns both human-readable chat text and structured board operations.
- Board operations are applied immediately on the client and added to undo history as one grouped action.

## Architecture

### Board Model
Each active board should support:
- `nodes`
- `edges`
- `camera`
- `history`
- `future`

Node types:
- `text`
- `project`
- `image`
- `link`
- `group`

Internal node shape stays compatible with the current app:
- position via `x` / `y`
- dimensions via `w` / `h`

Edges replace the current `connections` model internally, but old source data should still be upgraded automatically when loading a board.

### Frontend Responsibilities
- Render all node types and edge paths.
- Track selection, hover, mouse world position, marquee state, edge-draft state, and assistant UI state.
- Apply local board operations with validation.
- Maintain undo/redo snapshots in memory.
- Persist board camera, nodes, and edges to local storage.
- Export/import the active board as JSON Canvas-compatible data.

### Backend Responsibilities
- Add a dedicated workspace assistant endpoint rather than reusing the assets page chat prompt.
- Accept chat messages plus structured canvas context.
- Build a constrained prompt that tells the model to:
  - reason from provided board data
  - focus on nearby and selected context first
  - return JSON with `reply` and `operations`
  - keep operations minimal and valid
- Return a helpful `503` if the AI key is missing, consistent with the existing API style.

## Data Flow
1. The client captures the active board state and interaction context.
2. The client sends:
   - conversation messages
   - board metadata
   - nearby nodes
   - selected nodes
   - visible nodes summary
   - requested intent
3. The backend generates a structured reply.
4. The client validates the returned operations.
5. The client pushes one undo snapshot, applies the operations, persists the board, and re-renders.
6. The chat thread shows both the assistant explanation and a compact change summary.

## Safety and Validation
- Ignore malformed operations.
- Ignore operations targeting missing nodes.
- Clamp sizes to safe minimums.
- Keep AI writes scoped to the active board only.
- Preserve the current board if parsing fails.
- Keep manual undo/redo available for all AI-applied mutations.

## Testing Strategy
- Add structural tests for new workspace UI markers.
- Add model-level tests for board edge migration, JSON Canvas export/import, and AI context ranking.
- Add API contract tests for the workspace assistant endpoint when the AI key is missing.
- Run the existing regression suite plus the new targeted tests.

## Non-Goals
- Real-time multi-user collaboration
- Rich-text editing inside cards
- Full filesystem-backed Obsidian file cards
- Replacing the existing visual design system
