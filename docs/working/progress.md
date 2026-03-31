# Progress Log

## 2026-03-31
- Reproduced the user's reported workspace canvas issues in a real browser flow.
- Verified that existing automated regressions missed the real problem because they focused nodes programmatically instead of following the human double-click-to-create flow.
- Confirmed that a new text node is created on double-click, but focus remains on `BODY` instead of the new textarea.
- Confirmed that hover alone does not reveal connection handles, which makes edge creation hard to discover.
- Wrote a design doc and implementation plan for aligning the current canvas interactions with Obsidian Canvas and `obsidian-advanced-canvas`.
- Tightened the Playwright regressions so they now cover immediate typing after note creation and automatic edge landing when connecting from below.
- Implemented post-create text focus, placeholder selection, DOM-stable connection handles, and automatic target-side inference for edges.
- Verified the canvas changes with:
  - `node tests/verify-workspace-text-edit.mjs`
  - `node tests/verify-workspace-edge-connect.mjs`
  - `node tests/verify-realtime-collaboration-ui.mjs`
  - `node tests/verify-workspace-pan-drag.mjs`
  - `node tests/verify-workspace-page.mjs`
  - `node tests/verify-project-canvas-ui.mjs`
- Confirmed the next approved scope: use a real `file` node system for local image/PDF attachments, while keeping webpage insertion on the separate `link` path for now.
- Verified that the current code already has legacy `image` rendering and `link` nodes, but lacks upload persistence, file insertion UI, and a first-class `file` node shape.
- Wrote the design doc and implementation plan for durable workspace file nodes.
