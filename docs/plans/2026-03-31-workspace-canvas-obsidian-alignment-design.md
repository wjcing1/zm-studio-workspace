# Workspace Canvas Obsidian Alignment Design

## Goal

Keep the current workspace canvas implementation, but make its core interactions feel closer to Obsidian Canvas and the `obsidian-advanced-canvas` plugin. The priority is not feature parity. The priority is to remove the current friction around creating notes, discovering edge handles, and drawing connections naturally.

## Current Problems

- Double-clicking blank space creates a text node, but the new node does not enter editing mode automatically.
- Connection handles are only rendered after selection, so they are hard to discover and feel unreliable during normal hover-driven exploration.
- Edge landing sides are mostly inferred from the source side, which makes many connections land on visually awkward sides.
- The current browser regressions cover synthetic success paths, but they do not fully protect the user-facing creation and hover flows.

## Reference Baseline

This redesign uses two references:

1. Obsidian Canvas interaction expectations from the official help docs:
   - create a card quickly
   - start typing immediately
   - drag visible connection handles between cards
2. `obsidian-advanced-canvas` interaction ideas:
   - automatic edge side selection
   - stronger connection affordances
   - smoother note-creation workflow

The implementation will not copy plugin code. It will only adapt the interaction model to the current hand-rolled workspace canvas.

## Recommended Approach

Keep the existing board model and persistence layer, but refine the interaction state machine in `scripts/workspace-page.js`.

### Text Node Creation

- After creating a text node, select it as today.
- Immediately schedule focus into its textarea after render.
- If the node still contains the default placeholder, select that placeholder text so the first keystroke replaces it.

### Connection Handle Discovery

- Show node ports when a node is hovered or selected.
- Trigger a canvas rerender when hover target changes, but avoid extra rerenders while typing in inputs.
- Increase the apparent affordance of the ports in CSS so they are easier to notice and hit.

### Automatic Edge Landing

- During edge drafting, determine the target side from the relative center-to-center direction between source and target nodes.
- Use that computed side for both the draft preview and the final saved edge.
- Preserve duplicate-edge protection and existing history behavior.

## Data Flow

- Board data format stays unchanged: nodes and edges remain in the existing JSON Canvas-like shape.
- New node creation still goes through `createCanvasNode()` and existing persistence.
- Focus targeting is UI-only state and should not affect saved board payloads.
- Edge auto-side logic only changes `toSide` values at the time of connection creation.

## Risks And Guardrails

- Full-canvas rerenders can steal focus from textareas. Focus restoration must happen after render and only for intentional create/edit transitions.
- Hover-driven rerenders can feel noisy if they trigger on every pointermove. We should rerender only when the hovered node id actually changes.
- Collaboration presence and existing text editing must keep working, so new focus behavior should be limited to freshly created text nodes.

## Testing

- Browser regression: double-click blank canvas creates a text node and focuses its editor immediately.
- Browser regression: hovering a node reveals connection handles before dragging.
- Browser regression: dragging a handle to another node still creates an edge.
- Adjacent regression checks: text editing, collaboration presence, workspace page markers, and pan/drag behavior remain intact.
