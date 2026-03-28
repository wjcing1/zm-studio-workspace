# Task Plan: Realtime Collaboration and Cloud Persistence Foundations

## Goal
Turn the current single-user workspace into the first cloud-ready slice of a multi-user collaboration platform by introducing server-backed board persistence, workspace-aware data contracts, and a realtime collaboration integration path.

## Current Phase
Phase 3

## Phases
### Phase 1: Discovery and Design
- [x] Audit the current workspace board model, persistence path, and server surface
- [x] Confirm the target is realtime multi-user collaboration from day one
- [x] Choose the recommended architecture and record it in a design doc
- **Status:** complete

### Phase 2: Planning and Contracts
- [x] Decide the workspace, board, membership, and snapshot data boundaries
- [x] Define the first implementation slice that can ship without external credentials
- [x] Write an implementation plan with tests first
- **Status:** complete

### Phase 3: Backend Foundation
- [ ] Add collaboration configuration and environment wiring
- [ ] Add a server-side board repository abstraction with workspace-aware contracts
- [ ] Add API endpoints for board load and save flows
- **Status:** in_progress

### Phase 4: Client Integration
- [ ] Replace direct `localStorage` ownership with a board persistence adapter
- [ ] Add cloud-first loading with local fallback/cache behavior
- [ ] Preserve the existing board renderer and interaction model
- **Status:** pending

### Phase 5: Verification and Delivery
- [ ] Add or update regression coverage for the new API and persistence behavior
- [ ] Run targeted and broad verification
- [ ] Summarize the new cloud-ready collaboration path for the user
- **Status:** pending

## Key Questions
1. How do we move from browser-only persistence to shared cloud persistence without rewriting the whole canvas renderer?
2. Which parts of the board belong in durable storage versus realtime presence state?
3. What first implementation slice is useful now even before Supabase, Hocuspocus, or Yjs credentials are available?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Keep the current `board -> nodes -> edges -> camera` shape as the client rendering contract | Minimizes churn in `scripts/workspace-page.js` and `scripts/shared/workspace-board.js` |
| Introduce a server-side board repository instead of writing directly to `localStorage` | Creates a clean seam for cloud persistence and future provider swaps |
| Model `workspace` as the top-level collaboration scope | This matches future memberships, invites, billing, and board ownership |
| Plan for `Yjs + Hocuspocus` as the realtime layer and `Postgres + Storage` as durable backing services | Best fit for high-frequency canvas edits and multi-user concurrency |
| Ship a credentials-free first slice with cloud-ready contracts and a local server-backed adapter | Lets the product move forward immediately without blocking on external infra setup |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `npm test` failed once in the new worktree while spawning `server.mjs` with an `openai` package resolution error | 1 | Re-ran the previously failing encoded-route check directly and it passed; treating the full-suite failure as transient until it reproduces |

## Notes
- Work is being executed in `/Users/jiachenwang/Desktop/ai工作室/.worktrees/codex-realtime-collab-platform`
- Branch: `codex/realtime-collab-platform`
- Keep the current AI assistant endpoint intact while introducing collaboration infrastructure beside it
