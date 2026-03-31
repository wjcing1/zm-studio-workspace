# Task Plan

## Goal
Improve the current workspace canvas interactions so they feel closer to Obsidian Canvas and `obsidian-advanced-canvas`, without replacing the existing board model or renderer.

## Phases
- [completed] Reproduce the reported canvas UX problems in the browser
- [completed] Compare current behavior against Obsidian Canvas references
- [completed] Write approved design and implementation docs for the interaction redesign
- [completed] Add failing regressions for create-and-type and hover-to-connect flows
- [completed] Implement the minimal interaction changes in the existing canvas
- [completed] Run targeted and adjacent workspace regressions
- [completed] Lock the next approved scope: durable `file` nodes for image/PDF attachments, while keeping webpages on the separate `link` path
- [completed] Write approved design and implementation docs for file nodes
- [in_progress] Add failing regressions for upload API, file-node board model, and canvas insertion flow
- [pending] Implement upload persistence and file-node rendering/insertion
- [pending] Run targeted and adjacent workspace regressions for the new attachment flow

## Constraints
- Keep the current hand-rolled canvas implementation in `scripts/workspace-page.js`.
- Do not replace the board data model or persistence flow.
- Do not overwrite unrelated user changes in `.data/boards/overview.json`, `.obsidian/workspace.json`, or `.data/boards/PRJ-002.json`.
- Prioritize UX changes around text creation, connection handle discovery, and automatic edge landing.
- For the new attachment scope, treat local image/PDF files as first-class `file` nodes and keep web pages on the separate `link` workflow for now.

## Errors Encountered
| Error | Attempt | Resolution |
| --- | --- | --- |
| Existing Playwright regressions passed even though the user still experienced broken UX | 1 | Switched to reproductions that follow real user flows like double-click create and hover-before-connect. |
