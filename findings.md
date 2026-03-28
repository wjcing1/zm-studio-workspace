# Findings & Decisions

## Requirements
- The user wants "花布" to gain cloud persistence.
- The product direction is toward a multi-user collaboration platform, not a single-user demo.
- The user explicitly chose realtime multi-user collaboration as the target state from the beginning.
- The backend choice can be flexible, but the architecture should be robust enough to support `Postgres + Yjs/Hocuspocus + object storage`.

## Research Findings
- The current board data is seeded from `/Users/jiachenwang/Desktop/ai工作室/.worktrees/codex-realtime-collab-platform/studio-data.mjs`.
- Durable client edits currently flow through `persistBoard()` in `/Users/jiachenwang/Desktop/ai工作室/.worktrees/codex-realtime-collab-platform/scripts/shared/studio-data-client.js`, which writes to `window.localStorage`.
- The board model in `/Users/jiachenwang/Desktop/ai工作室/.worktrees/codex-realtime-collab-platform/scripts/shared/workspace-board.js` already normalizes `camera`, `nodes`, `edges`, history, and import/export behavior.
- The workspace page in `/Users/jiachenwang/Desktop/ai工作室/.worktrees/codex-realtime-collab-platform/scripts/workspace-page.js` is a good candidate for a persistence adapter because rendering and interaction are already separated from raw storage concerns.
- The existing Node server in `/Users/jiachenwang/Desktop/ai工作室/.worktrees/codex-realtime-collab-platform/server.mjs` currently serves static assets and AI endpoints but has no board persistence API.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Add collaboration config parsing to the server and client | Establishes explicit feature flags and environment-driven provider selection |
| Introduce a server board repository abstraction | Keeps the first local server-backed implementation swappable with future Supabase/Postgres adapters |
| Treat board content as durable document state and cursor/selection as ephemeral presence state | Matches how realtime collaboration systems usually separate persistence from awareness |
| Store board snapshots on the server in the first slice | Gives us immediate shared persistence and migration structure even before websocket sync lands |
| Keep `localStorage` only as optional client cache | Avoids data ownership split while still supporting quick recovery and offline-friendly behavior |
| Debounce server saves from the client while writing the cache immediately | Preserves the current editing feel and prevents a network write per edit event |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| No existing worktree location was configured for the repository | Defaulted to a hidden project-local `.worktrees/` directory and isolated work on a `codex/` branch |
| `.worktrees/` was not ignored in the repository | Added `.worktrees/` to `.gitignore` in the main workspace before creating the isolated worktree |
| One full-suite baseline run failed during server startup in the new worktree | Confirmed the directly affected encoded-route check passes; will re-run the full suite after the collaboration foundation changes are in place |
| A stale server on port `4323` caused one API test run to hit old routes | Killed the stale process and reran the test against the current code |

## Resources
- `/Users/jiachenwang/Desktop/ai工作室/.worktrees/codex-realtime-collab-platform/server.mjs`
- `/Users/jiachenwang/Desktop/ai工作室/.worktrees/codex-realtime-collab-platform/studio-data.mjs`
- `/Users/jiachenwang/Desktop/ai工作室/.worktrees/codex-realtime-collab-platform/scripts/shared/studio-data-client.js`
- `/Users/jiachenwang/Desktop/ai工作室/.worktrees/codex-realtime-collab-platform/scripts/shared/workspace-board.js`
- `/Users/jiachenwang/Desktop/ai工作室/.worktrees/codex-realtime-collab-platform/scripts/workspace-page.js`
- `/Users/jiachenwang/Desktop/ai工作室/.worktrees/codex-realtime-collab-platform/docs/plans`

## Visual and Interaction Findings
- The current workspace already has the right interaction density for collaborative use: selection, dragging, grouping, edges, and an assistant panel.
- Because the board renderer is already board-key aware, it can map naturally onto future workspace and board identifiers.
- The current UI can absorb collaborative presence markers later without redesigning the whole shell.
- The new client adapter can hydrate from the server after the initial render without changing the existing canvas shell structure.

---
*Update this file after every meaningful discovery so context survives session boundaries.*
